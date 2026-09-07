import { v4 as uuidv4 } from "uuid";
import {
  getSession,
  getMessages,
  saveMessage,
  updateSession,
  extractAndSaveIdea,
  getIdea,
  findBestSessionForIdea,
  getCrossChatContext,
  getIdeaHonestySnapshot,
} from "@/lib/db";
import { streamAgentResponse } from "@/lib/cursor-agent";
import { findRelatedIdeas, linkRelatedIdeas } from "@/lib/idea-linker";
import { runDeepRecon } from "@/lib/web-research";
import { shouldRunWebResearch, shouldRunPanelResearch, isCasualMessage } from "@/lib/message-utils";
import { runHonestyBreakdown } from "@/lib/honesty-agent";
import { routeMessage } from "@/lib/agent-router";
import { runPanelPerspectives } from "@/lib/panel-agents";
import { computeIdeaHonestyUpdate } from "@/lib/idea-honesty";
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

  const topRelated = related[0];
  let similarIdeaNudge: {
    ideaId: string;
    title: string;
    sessionId: string;
    score: number;
  } | undefined;

  if (topRelated && topRelated.score >= 0.12) {
    const otherSession = findBestSessionForIdea(topRelated.idea.id);
    if (otherSession && otherSession !== sessionId) {
      similarIdeaNudge = {
        ideaId: topRelated.idea.id,
        title: topRelated.idea.title,
        sessionId: otherSession,
        score: topRelated.score,
      };
    }
  }

  const crossChatContext = ideaId ? getCrossChatContext(ideaId, sessionId) : "";
  const relatedCrossChat = related
    .slice(0, 2)
    .map((r) => getCrossChatContext(r.idea.id, sessionId))
    .filter(Boolean)
    .join("\n");
  const fullCrossChat = [crossChatContext, relatedCrossChat].filter(Boolean).join("\n\n");

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
      let ideaHonestyDelta: number | undefined;
      let perspectives: AgentPerspective[] = [];

      try {
        const runResearch =
          shouldRunWebResearch(agentId, message) || shouldRunPanelResearch(message);

        if (runResearch && !casual) {
          send({ type: "status", message: "Researching the market for the panel..." });
          reconResult = await runDeepRecon(message);
          researchBlock = reconResult.researchBlock;
          depthScore = {
            overall: reconResult.depth.depthScore,
            competitionLevel: reconResult.depth.competitionLevel,
            verdict: reconResult.depth.verdict,
            signals: reconResult.depth.signals,
          };
        }

        const history = historyMessages.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        if (!casual && agentId !== "honesty-coach") {
          send({ type: "status", message: "Panel discussing your idea..." });
          perspectives = await runPanelPerspectives({
            message: topicMessage ?? message,
            researchBlock,
            crossChatContext: fullCrossChat || undefined,
            depthScore,
            recon: reconResult,
            history,
          });
          send({ type: "perspectives", perspectives });
        }

        if (agentId === "honesty-coach" && !casual) {
          send({ type: "status", message: "Honesty Coach analyzing claims..." });
          const result = await runHonestyBreakdown(message);
          honestyBreakdown = result.breakdown ?? undefined;
          honestyNarrative = result.narrative;
        }

        if (ideaId && !casual) {
          const { breakdown, delta } = computeIdeaHonestyUpdate({
            ideaId,
            userMessage: message,
            perspectives,
            competitionLevel: depthScore?.competitionLevel ?? reconResult?.depth.competitionLevel,
            depthScore: depthScore?.overall ?? reconResult?.depth.depthScore,
            hasResearch: Boolean(reconResult),
          });
          ideaHonestyDelta = delta;
          if (agentId === "honesty-coach" && honestyBreakdown) {
            honestyBreakdown = breakdown;
          }
        }

        saveMessage({
          id: userMsgId,
          sessionId,
          role: "user",
          content: message,
          honestyBreakdown: agentId === "honesty-coach" ? honestyBreakdown : undefined,
          depthScore,
          ideaId,
          relatedIdeas: relatedForClient,
        });

        send({
          type: "meta",
          honestyBreakdown: agentId === "honesty-coach" ? honestyBreakdown : undefined,
          ideaHonesty: ideaId ? getIdeaHonestySnapshot(ideaId) ?? undefined : undefined,
          ideaHonestyDelta,
          depthScore,
          relatedIdeas: relatedForClient,
          similarIdeaNudge,
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
            crossChatContext: fullCrossChat || undefined,
          })) {
            fullResponse += chunk;
            send({ type: "chunk", content: chunk });
          }
        }

        if (ideaId && !casual && fullResponse.trim()) {
          computeIdeaHonestyUpdate({
            ideaId,
            userMessage: message,
            perspectives,
            assistantResponse: fullResponse.trim(),
            competitionLevel: depthScore?.competitionLevel ?? reconResult?.depth.competitionLevel,
            depthScore: depthScore?.overall ?? reconResult?.depth.depthScore,
            hasResearch: Boolean(reconResult),
          });
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
          ideaHonesty: ideaId ? getIdeaHonestySnapshot(ideaId) ?? undefined : undefined,
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
