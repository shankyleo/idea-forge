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
import type { BmadAgentId, DepthScore, HonestyBreakdown } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId: string;
    message: string;
    agentId?: BmadAgentId;
  };

  const { sessionId, message, agentId: requestedAgentId } = body;
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

  const agentId = requestedAgentId ?? session.activeAgentId;
  updateSession(sessionId, { activeAgentId: agentId });

  const casual = isCasualMessage(message);
  const extractedIdea = casual ? null : extractAndSaveIdea(message, sessionId);
  const ideaId = extractedIdea?.id ?? session.activeIdeaId;

  if (extractedIdea && !session.activeIdeaId) {
    updateSession(sessionId, { activeIdeaId: extractedIdea.id });
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

  let researchBlock: string | undefined;
  let depthScore: DepthScore | undefined;
  let honestyBreakdown: HonestyBreakdown | undefined;
  let honestyNarrative: string | undefined;

  if (shouldRunWebResearch(agentId, message)) {
    const recon = await runDeepRecon(message);
    researchBlock = recon.researchBlock;
    depthScore = {
      overall: recon.depth.depthScore,
      competitionLevel: recon.depth.competitionLevel,
      verdict: recon.depth.verdict,
      signals: recon.depth.signals,
    };
  }

  if (agentId === "honesty-coach" && !casual) {
    const result = await runHonestyBreakdown(message);
    honestyBreakdown = result.breakdown ?? undefined;
    honestyNarrative = result.narrative;
  }

  const userMsgId = uuidv4();
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

  const ideaTitle = ideaId ? getIdea(ideaId)?.title : undefined;

  const encoder = new TextEncoder();
  const assistantMsgId = uuidv4();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send({
        type: "meta",
        honestyBreakdown,
        depthScore,
        relatedIdeas: relatedForClient,
        ideaId,
        ideaTitle: extractedIdea?.title ?? ideaTitle,
        agentId,
        userMessageId: userMsgId,
        assistantMessageId: assistantMsgId,
      });

      try {
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
        });

        send({ type: "done" });
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
