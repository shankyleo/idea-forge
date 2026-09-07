import { v4 as uuidv4 } from "uuid";
import {
  getSession,
  getMessages,
  saveMessage,
  updateSession,
  extractAndSaveIdea,
  getIdea,
} from "@/lib/db";
import { streamAgentResponse } from "@/lib/cursor-agent";
import { findRelatedIdeas, linkRelatedIdeas } from "@/lib/idea-linker";
import { runDeepRecon } from "@/lib/web-research";
import { shouldRunWebResearch, isCasualMessage } from "@/lib/message-utils";
import { runHonestyBreakdown } from "@/lib/honesty-agent";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { routeMessage } from "@/lib/agent-router";
import { generatePerspectives } from "@/lib/panel-perspectives";
import type { DepthScore, HonestyBreakdown, AgentPerspective } from "@/lib/types";
import type { DeepReconResult } from "@/lib/web-research";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId: string;
    message: string;
    activeIdeaId?: string;
  };

  const { sessionId, message, activeIdeaId: clientIdeaId } = body;
  if (!sessionId || !message?.trim()) {
    return new Response(JSON.stringify({ error: "sessionId and message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const historyMessages = getMessages(sessionId).filter((m) => m.role !== "system");
  const lastAssistant = [...historyMessages].reverse().find((m) => m.role === "assistant");

  const forgeMode = /^attack this[.!]?$/i.test(message.trim())
    ? ("attack" as const)
    : /^defend this[.!]?$/i.test(message.trim())
      ? ("defend" as const)
      : undefined;

  const topicMessage =
    forgeMode &&
    [...historyMessages].reverse().find(
      (m) => m.role === "user" && !/^(attack|defend) this/i.test(m.content.trim())
    )?.content;

  const route = routeMessage(message, {
    lastAgentId: lastAssistant?.agentId,
    messageCount: historyMessages.length,
  });
  const agentId = route.agentId;
  updateSession(sessionId, { activeAgentId: agentId });

  const casual = isCasualMessage(message);
  const extractedIdea = casual ? null : extractAndSaveIdea(message, sessionId);
  let ideaId = extractedIdea?.id ?? clientIdeaId ?? session.activeIdeaId;

  if (extractedIdea && !session.activeIdeaId && !clientIdeaId) {
    updateSession(sessionId, {
      activeIdeaId: extractedIdea.id,
      title: extractedIdea.title.slice(0, 60),
    });
    ideaId = extractedIdea.id;
  } else if (clientIdeaId && session.activeIdeaId !== clientIdeaId) {
    updateSession(sessionId, { activeIdeaId: clientIdeaId });
    ideaId = clientIdeaId;
  }

  const related = casual ? [] : findRelatedIdeas(message, ideaId);
  if (ideaId && related.length > 0) {
    linkRelatedIdeas(ideaId, related);
  }

  const relatedForPrompt = related.map((r) => ({
    title: r.idea.title,
    summary: r.idea.summary,
    reason: r.reason,
  }));

  const relatedForClient = related.map((r) => ({
    id: r.idea.id,
    title: r.idea.title,
    score: r.score,
    reason: r.reason,
  }));

  const userMsgId = uuidv4();
  const assistantMsgId = uuidv4();
  const ideaTitle = ideaId ? getIdea(ideaId)?.title : undefined;

  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        type: "routing",
        agentId,
        routeReason: route.reason,
        matchedAgents: route.matchedAgents,
      });

      let researchBlock: string | undefined;
      let depthScore: DepthScore | undefined;
      let reconResult: DeepReconResult | undefined;
      let honestyBreakdown: HonestyBreakdown | undefined;
      let honestyNarrative: string | undefined;
      let perspectives: AgentPerspective[] = [];

      try {
        if (shouldRunWebResearch(agentId, message)) {
          send({ type: "status", message: "Deep Recon searching the market..." });
          reconResult = await runDeepRecon(message);
          researchBlock = reconResult.researchBlock;
          depthScore = {
            overall: reconResult.depth.depthScore,
            competitionLevel: reconResult.depth.competitionLevel,
            verdict: reconResult.depth.verdict,
            signals: reconResult.depth.signals,
          };
        }

        const ruleHonesty = casual
          ? undefined
          : scoreHonesty(message, {
              competitionLevel: depthScore?.competitionLevel ?? reconResult?.depth.competitionLevel,
              depthScore: depthScore?.overall ?? reconResult?.depth.depthScore,
              hasResearch: Boolean(reconResult),
            });

        if (!casual && agentId !== "honesty-coach") {
          perspectives = generatePerspectives({
            message: topicMessage ?? message,
            depthScore,
            recon: reconResult,
            primaryAgentId: agentId,
            honesty: ruleHonesty,
          });
        }

        if (agentId === "honesty-coach" && !casual) {
          send({ type: "status", message: "Honesty Coach analyzing claims..." });
          const result = await runHonestyBreakdown(message);
          honestyBreakdown = result.breakdown ?? undefined;
          honestyNarrative = result.narrative;
        }

        // Always attach a dynamic, input-driven honesty breakdown. The live
        // Honesty Coach (when routed) wins; otherwise the rule-based baseline
        // keeps every idea grounded.
        honestyBreakdown = honestyBreakdown ?? ruleHonesty;

        saveMessage({
          id: userMsgId,
          sessionId,
          role: "user",
          content: message,
          honestyBreakdown,
          depthScore,
          ideaId,
          relatedIdeas: relatedForClient,
        });

        const history = getMessages(sessionId)
          .filter((m) => m.role !== "system")
          .slice(-10)
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        send({
          type: "meta",
          honestyBreakdown,
          depthScore,
          relatedIdeas: relatedForClient,
          ideaId,
          ideaTitle: extractedIdea?.title ?? ideaTitle,
          agentId,
          routeReason: route.reason,
          matchedAgents: route.matchedAgents,
          perspectives,
          showForgeActions: !casual && agentId !== "honesty-coach",
          userMessageId: userMsgId,
          assistantMessageId: assistantMsgId,
        });

        if (agentId === "honesty-coach" && !casual && honestyNarrative) {
          fullResponse = honestyNarrative;
          const chunks = honestyNarrative.split(/(?<=\.|!|\?|\n)\s+/);
          for (const chunk of chunks) {
            send({ type: "chunk", content: chunk + " " });
          }
        } else {
          for await (const chunk of streamAgentResponse({
            agentId,
            message,
            history: history.slice(0, -1),
            relatedIdeas: relatedForPrompt,
            ideaTitle: extractedIdea?.title ?? ideaTitle,
            researchBlock,
            depthScore,
            recon: reconResult,
            forgeMode,
            topicMessage: topicMessage ?? message,
          })) {
            fullResponse += chunk;
            send({ type: "chunk", content: chunk });
          }
        }

        saveMessage({
          id: assistantMsgId,
          sessionId,
          role: "assistant",
          content: fullResponse.trim(),
          agentId,
          ideaId,
          routeReason: route.reason,
          matchedAgents: route.matchedAgents,
          perspectives,
          showForgeActions: !casual && agentId !== "honesty-coach",
          depthScore,
        });

        send({
          type: "done",
          perspectives,
          showForgeActions: !casual && agentId !== "honesty-coach",
          depthScore,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Stream failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
