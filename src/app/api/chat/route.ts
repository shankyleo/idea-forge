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
  updateMessageHonestyBreakdown,
} from "@/lib/db";
import { streamAgentResponse } from "@/lib/cursor-agent";
import { findRelatedIdeas, linkRelatedIdeas } from "@/lib/idea-linker";
import { runDeepRecon } from "@/lib/web-research";
import { shouldRunWebResearch, shouldRunPanelResearch, isCasualMessage, shouldExtractNewIdea } from "@/lib/message-utils";
import { runHonestyBreakdown } from "@/lib/honesty-agent";
import { routeMessage } from "@/lib/agent-router";
import { parseSlashCommand, slashRouteReason, shouldRunTeamPanel, shouldTrackIdeaHonesty, shouldRunSlashAwareResearch } from "@/lib/slash-commands";
import { runPanelPerspectives } from "@/lib/panel-agents";
import { computeIdeaHonestyUpdate } from "@/lib/idea-honesty";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { getAgent } from "@/lib/bmad/agents";
import type { DepthScore, HonestyBreakdown, AgentPerspective } from "@/lib/types";
import type { DeepReconResult } from "@/lib/web-research";

export const runtime = "nodejs";
export const maxDuration = 120;

function honestyContext(
  depthScore: DepthScore | undefined,
  reconResult: DeepReconResult | undefined
) {
  return {
    competitionLevel: depthScore?.competitionLevel ?? reconResult?.depth.competitionLevel,
    depthScore: depthScore?.overall ?? reconResult?.depth.depthScore,
    hasResearch: Boolean(reconResult),
  };
}

function buildHonestyInput(
  message: string,
  perspectives: AgentPerspective[],
  assistantResponse?: string
): string {
  const panelText = perspectives.map((p) => `${p.name}: ${p.content}`).join("\n");
  return [message, panelText, assistantResponse].filter(Boolean).join("\n\n");
}

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

  const slash = parseSlashCommand(message.trim());

  const route = slash
    ? {
        agentId: slash.agentId,
        reason: slashRouteReason(slash.command),
        matchedAgents: [{ id: slash.agentId, label: `/${slash.command}` }],
      }
    : routeMessage(message, {
        lastAgentId: lastAssistant?.agentId,
        messageCount: historyMessages.length,
      });

  const agentId = route.agentId;
  updateSession(sessionId, { activeAgentId: agentId });

  /** Idea/panel/honesty use this; slash-only falls back to the thread topic. */
  const workingMessage =
    slash && slash.body
      ? slash.body
      : slash
        ? (topicMessage ?? "Share an idea for the team to work on.")
        : message;

  const casual = slash ? false : isCasualMessage(message);
  const priorUserMessages = historyMessages.filter((m) => m.role === "user").length;
  const mintNewIdea =
    !casual &&
    !session.activeIdeaId &&
    !clientIdeaId &&
    shouldExtractNewIdea(workingMessage, priorUserMessages);

  const extractedIdea = mintNewIdea ? extractAndSaveIdea(workingMessage, sessionId) : null;
  let ideaId = clientIdeaId ?? session.activeIdeaId ?? extractedIdea?.id;

  if (extractedIdea && !session.activeIdeaId && !clientIdeaId) {
    updateSession(sessionId, {
      activeIdeaId: extractedIdea.id,
      title: extractedIdea.title.slice(0, 60),
    });
    ideaId = extractedIdea.id;
  } else if (session.activeIdeaId && !ideaId) {
    ideaId = session.activeIdeaId;
  } else if (clientIdeaId && session.activeIdeaId !== clientIdeaId) {
    updateSession(sessionId, { activeIdeaId: clientIdeaId });
    ideaId = clientIdeaId;
  }

  const related = casual ? [] : findRelatedIdeas(workingMessage, ideaId);
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
        const runPanel = shouldRunTeamPanel(slash, casual);
        const runResearch = shouldRunSlashAwareResearch(
          slash,
          agentId,
          workingMessage,
          shouldRunWebResearch,
          shouldRunPanelResearch,
          casual
        );

        if (runResearch) {
          send({
            type: "status",
            message: slash?.agentId === "deep-recon"
              ? "Researching the market..."
              : "Researching the market for the panel...",
          });
          reconResult = await runDeepRecon(workingMessage);
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

        if (runPanel) {
          send({ type: "status", message: "Panel discussing your idea..." });
          perspectives = await runPanelPerspectives({
            message: topicMessage ?? workingMessage,
            researchBlock,
            crossChatContext: fullCrossChat || undefined,
            depthScore,
            recon: reconResult,
            history,
          });
          send({ type: "perspectives", perspectives });
        }

        if (agentId === "honesty-coach" && !casual) {
          send({ type: "status", message: `${getAgent("honesty-coach").name} analyzing claims...` });
          const result = await runHonestyBreakdown(workingMessage);
          honestyBreakdown = result.breakdown ?? undefined;
          honestyNarrative = result.narrative;
        }

        const depthForClient = runResearch ? depthScore : undefined;

        saveMessage({
          id: userMsgId,
          sessionId,
          role: "user",
          content: message,
          depthScore: depthForClient,
          ideaId,
          relatedIdeas: relatedForClient,
        });

        send({
          type: "meta",
          depthScore: depthForClient,
          relatedIdeas: relatedForClient,
          similarIdeaNudge,
          ideaId,
          ideaTitle: extractedIdea?.title ?? ideaTitle,
          agentId,
          routeReason: route.reason,
          matchedAgents: route.matchedAgents,
          perspectives: runPanel ? perspectives : [],
          directInvoke: Boolean(slash && slash.agentId !== "party-mode"),
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
            message: workingMessage,
            history: history.slice(0, -1),
            relatedIdeas: relatedForPrompt,
            ideaTitle: extractedIdea?.title ?? ideaTitle,
            researchBlock,
            depthScore,
            recon: reconResult,
            forgeMode,
            topicMessage: topicMessage ?? workingMessage,
            crossChatContext: fullCrossChat || undefined,
          })) {
            fullResponse += chunk;
            send({ type: "chunk", content: chunk });
          }
        }

        let finalUserHonesty: HonestyBreakdown | undefined;
        if (!casual) {
          finalUserHonesty =
            agentId === "honesty-coach" && honestyBreakdown
              ? honestyBreakdown
              : scoreHonesty(
                  buildHonestyInput(workingMessage, perspectives, fullResponse.trim()),
                  honestyContext(depthScore, reconResult)
                );
          updateMessageHonestyBreakdown(userMsgId, finalUserHonesty);

          if (shouldTrackIdeaHonesty(slash, casual) && ideaId) {
            const { delta } = computeIdeaHonestyUpdate({
              ideaId,
              userMessage: workingMessage,
              perspectives,
              assistantResponse: fullResponse.trim(),
              competitionLevel: depthScore?.competitionLevel ?? reconResult?.depth.competitionLevel,
              depthScore: depthScore?.overall ?? reconResult?.depth.depthScore,
              hasResearch: Boolean(reconResult),
            });
            ideaHonestyDelta = delta;
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
          perspectives: runPanel ? perspectives : [],
          showForgeActions: !casual && agentId !== "honesty-coach",
          depthScore: depthForClient,
        });

        send({
          type: "done",
          perspectives: runPanel ? perspectives : [],
          showForgeActions: !casual && agentId !== "honesty-coach",
          depthScore: depthForClient,
          ideaHonesty: shouldTrackIdeaHonesty(slash, casual) && ideaId
            ? getIdeaHonestySnapshot(ideaId) ?? undefined
            : undefined,
          honestyBreakdown: finalUserHonesty,
          ideaHonestyDelta: shouldTrackIdeaHonesty(slash, casual) ? ideaHonestyDelta : undefined,
          userMessageId: userMsgId,
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
