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
  getAppForChatSession,
} from "@/lib/db";
import { streamAgentResponse } from "@/lib/cursor-agent";
import {
  allowAmeliaFixLoop,
  canAffordAmeliaFix,
  dropIdeasTessSlash,
  formatTessReport,
  shouldValidateAppTurn,
  validateAppPreview,
  type AppValidateResult,
} from "@/lib/app-validate";
import { findRelatedIdeas, linkRelatedIdeas } from "@/lib/idea-linker";
import { runAppStackRecon, runDeepRecon, shouldRunAppStackRecon } from "@/lib/web-research";
import { ameliaCommitMessage, pushAppBuild, shouldSkipAppGitPush } from "@/lib/app-git-push";
import { shouldRunWebResearch, shouldRunPanelResearch, isCasualMessage, shouldExtractNewIdea } from "@/lib/message-utils";
import { runHonestyBreakdown } from "@/lib/honesty-agent";
import { routeMessage, routeAppMessage, isAppBuildIntent } from "@/lib/agent-router";
import { parseSlashCommand, slashRouteReason, shouldRunTeamPanel, shouldTrackIdeaHonesty, shouldRunSlashAwareResearch } from "@/lib/slash-commands";
import { runPanelPerspectives, runAppPanelPerspectives } from "@/lib/panel-agents";
import { computeIdeaHonestyUpdate } from "@/lib/idea-honesty";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { getAgent, isAppTeamAgent } from "@/lib/bmad/agents";
import type { DepthScore, HonestyBreakdown, AgentPerspective } from "@/lib/types";
import type { DeepReconResult } from "@/lib/web-research";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const slashRaw = parseSlashCommand(message.trim());
  const appRecord = getAppForChatSession(sessionId);
  const isAppChat = Boolean(appRecord);
  const slash =
    !slashRaw ||
    (isAppChat && !isAppTeamAgent(slashRaw.agentId)) ||
    dropIdeasTessSlash(isAppChat, slashRaw.agentId)
      ? null
      : slashRaw;

  const route = slash
    ? {
        agentId: slash.agentId,
        reason: slashRouteReason(slash.command),
        matchedAgents: [{ id: slash.agentId, label: `/${slash.command}` }],
      }
    : isAppChat
      ? routeAppMessage(message, {
          lastAgentId: lastAssistant?.agentId,
        })
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
    !isAppChat &&
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

  const related = isAppChat || casual ? [] : findRelatedIdeas(workingMessage, ideaId);
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
      let closed = false;
      const send = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => send({ type: "ping" }), 8_000);

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
        const runAppPanel =
          isAppChat &&
          !casual &&
          !slash &&
          agentId !== "developer" &&
          agentId !== "validator" &&
          !isAppBuildIntent(message);
        const runPanel =
          (!isAppChat && shouldRunTeamPanel(slash, casual)) || runAppPanel;
        const runResearch =
          !isAppChat &&
          shouldRunSlashAwareResearch(
            slash,
            agentId,
            workingMessage,
            shouldRunWebResearch,
            shouldRunPanelResearch,
            casual
          );
        const runAppRecon = shouldRunAppStackRecon({ isAppChat, agentId, casual });

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
        } else if (runAppRecon) {
          send({
            type: "status",
            message: "Checking current APIs and stack…",
          });
          const stackRecon = await runAppStackRecon(workingMessage);
          researchBlock = stackRecon.researchBlock;
        }

        const history = historyMessages.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        if (runPanel) {
          send({
            type: "status",
            message: isAppChat
              ? "Team discussing your feedback..."
              : "Panel discussing your idea...",
          });
          perspectives = isAppChat
            ? await runAppPanelPerspectives({
                message: topicMessage ?? workingMessage,
                researchBlock,
                history,
              })
            : await runPanelPerspectives({
                message: topicMessage ?? workingMessage,
                researchBlock,
                crossChatContext: fullCrossChat || undefined,
                depthScore,
                recon: reconResult,
                history,
              });
          send({ type: "perspectives", perspectives });
        }

        if (!isAppChat && agentId === "honesty-coach" && !casual) {
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
          showForgeActions: !isAppChat && !casual && agentId !== "honesty-coach",
          userMessageId: userMsgId,
          assistantMessageId: assistantMsgId,
        });

        if (!isAppChat && agentId === "honesty-coach" && !casual && honestyNarrative) {
          fullResponse = honestyNarrative;
          const chunks = honestyNarrative.split(/(?<=\.|!|\?|\n)\s+/);
          for (const chunk of chunks) {
            send({ type: "chunk", content: chunk + " " });
          }
        } else if (agentId !== "validator") {
          send({
            type: "status",
            message: `${getAgent(agentId).name} is working…`,
          });
          for await (const chunk of streamAgentResponse({
            agentId,
            message: workingMessage,
            history: history.slice(0, -1),
            relatedIdeas: relatedForPrompt,
            ideaTitle: appRecord?.title ?? extractedIdea?.title ?? ideaTitle,
            researchBlock,
            depthScore,
            recon: reconResult,
            forgeMode,
            topicMessage: topicMessage ?? workingMessage,
            crossChatContext: isAppChat ? undefined : fullCrossChat || undefined,
            workspace: isAppChat ? "app" : "ideas",
            workspaceCwd: isAppChat && agentId === "developer" ? appRecord?.localPath : undefined,
            localPath: appRecord?.localPath,
            githubRepo: appRecord?.githubRepo,
            onStatus: (message) => send({ type: "status", message }),
          })) {
            fullResponse += chunk;
            send({ type: "chunk", content: chunk });
          }
        }

        const persistAssistant = (
          id: string,
          content: string,
          speaker: typeof agentId,
          extra?: { perspectives?: AgentPerspective[] }
        ) => {
          saveMessage({
            id,
            sessionId,
            role: "assistant",
            content: content.trim(),
            agentId: speaker,
            ideaId,
            routeReason: speaker === agentId ? route.reason : `${getAgent(speaker).name} responding`,
            matchedAgents: route.matchedAgents,
            perspectives: extra?.perspectives ?? [],
            showForgeActions: !isAppChat && !casual && speaker !== "honesty-coach",
            depthScore: depthForClient,
          });
          send({
            type: "assistant",
            id,
            agentId: speaker,
            content: content.trim(),
            routeReason: speaker === agentId ? route.reason : `${getAgent(speaker).name} responding`,
          });
        };

        const streamText = (text: string) => {
          send({ type: "chunk", content: text });
        };

        const runTessCheck = async (
          preview: { url: string; port: number } | { error: string }
        ): Promise<AppValidateResult> => {
          send({
            type: "status",
            message: `${getAgent("validator").name} is checking the app…`,
            agentId: "validator",
          });
          if ("error" in preview) {
            return {
              passed: false,
              repro: `Cannot start the preview (${preview.error}).`,
            };
          }
          send({ type: "preview", url: preview.url, port: preview.port });
          return validateAppPreview(preview.url);
        };

        let lastSaveId = assistantMsgId;
        let lastSaveAgent = agentId;

        if (isAppChat && appRecord && shouldValidateAppTurn(isAppChat, agentId)) {
          send({
            type: "status",
            message:
              agentId === "validator"
                ? "Starting the app…"
                : `${getAgent("developer").name} is starting the app…`,
          });
          const { ensureAppPreview } = await import("@/lib/app-preview");
          let preview = await ensureAppPreview(appRecord.id);
          if (agentId === "developer") {
            if ("url" in preview) {
              const note = `\n\n**Open the app:** ${preview.url}\n${getAgent("developer").name} started it — you don't need to run \`npm run dev\`.`;
              fullResponse += note;
              send({ type: "chunk", content: note });
              send({ type: "preview", url: preview.url, port: preview.port });
            } else {
              const note = `\n\nCould not start the preview (${preview.error}). ${getAgent("developer").name} should start the app in the folder and share a working URL.`;
              fullResponse += note;
              send({ type: "chunk", content: note });
            }
            persistAssistant(assistantMsgId, fullResponse, "developer", {
              perspectives: runPanel ? perspectives : [],
            });
            fullResponse = "";
          }

          const allowFixes = allowAmeliaFixLoop(agentId);
          const requestStarted = Date.now();
          let tessResult = await runTessCheck(preview);
          let tessText = formatTessReport(tessResult);
          streamText(tessText);
          let tessMsgId = agentId === "validator" ? assistantMsgId : uuidv4();
          let fixRound = 0;

          while (
            allowFixes &&
            !tessResult.passed &&
            fixRound < 2 &&
            canAffordAmeliaFix(280_000 - (Date.now() - requestStarted), fixRound + 1)
          ) {
            persistAssistant(tessMsgId, tessText, "validator");
            fixRound += 1;
            const fixId = uuidv4();
            send({
              type: "status",
              message: `${getAgent("developer").name} is fixing the break…`,
              agentId: "developer",
            });
            let fixText = "";
            const fixPrompt = `Fix only this preview validation failure. Do not expand scope.\n\n${tessResult.repro}`;
            try {
              for await (const chunk of streamAgentResponse({
                agentId: "developer",
                message: fixPrompt,
                history,
                relatedIdeas: relatedForPrompt,
                ideaTitle: appRecord.title,
                workspace: "app",
                workspaceCwd: appRecord.localPath,
                localPath: appRecord.localPath,
                githubRepo: appRecord.githubRepo,
                onStatus: (message) => send({ type: "status", message }),
              })) {
                fixText += chunk;
                send({ type: "chunk", content: chunk });
              }
            } catch (error) {
              const note =
                error instanceof Error ? error.message : "Fix run failed";
              const fallback = `\n\nFix attempt failed: ${note}`;
              fixText = (fixText.trim() || "Fix attempt failed.") + fallback;
              send({ type: "chunk", content: fallback });
            }
            persistAssistant(fixId, fixText, "developer");
            send({ type: "status", message: `${getAgent("developer").name} is starting the app…` });
            preview = await ensureAppPreview(appRecord.id);
            tessResult = await runTessCheck(preview);
            tessText = formatTessReport(tessResult);
            if (!tessResult.passed && fixRound >= 2) {
              tessText += `\n\nStopped after 2 fix rounds. Remaining break: ${tessResult.repro}`;
            }
            streamText(tessText);
            tessMsgId = uuidv4();
          }

          fullResponse = tessText;
          lastSaveId = tessMsgId;
          lastSaveAgent = "validator";
        }

        if (
          isAppChat &&
          appRecord &&
          agentId === "developer" &&
          !shouldSkipAppGitPush(appRecord.githubRepo)
        ) {
          send({ type: "status", message: "Pushing to GitHub…" });
          const pushResult = pushAppBuild(
            appRecord.localPath,
            appRecord.githubRepo,
            ameliaCommitMessage(workingMessage)
          );
          if (pushResult.note) {
            const note = `\n\n${pushResult.note}`;
            fullResponse += note;
            streamText(note);
          }
        }

        let finalUserHonesty: HonestyBreakdown | undefined;
        if (!isAppChat && !casual) {
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
          id: lastSaveId,
          sessionId,
          role: "assistant",
          content: fullResponse.trim(),
          agentId: lastSaveAgent,
          ideaId,
          routeReason: lastSaveAgent === agentId ? route.reason : `${getAgent(lastSaveAgent).name} responding`,
          matchedAgents: route.matchedAgents,
          perspectives: runPanel && lastSaveAgent === agentId ? perspectives : [],
          showForgeActions: !isAppChat && !casual && lastSaveAgent !== "honesty-coach",
          depthScore: depthForClient,
        });

        send({
          type: "done",
          agentId: lastSaveAgent,
          assistantMessageId: lastSaveId,
          perspectives: runPanel ? perspectives : [],
          showForgeActions: !isAppChat && !casual && agentId !== "honesty-coach",
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
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
