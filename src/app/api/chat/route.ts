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
import { scoreHonesty } from "@/lib/honesty-scorer";
import { findRelatedIdeas, linkRelatedIdeas } from "@/lib/idea-linker";
import { runDeepRecon } from "@/lib/web-research";
import { shouldRunWebResearch, isCasualMessage } from "@/lib/message-utils";
import type { BmadAgentId, DepthScore } from "@/lib/types";

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
  const honestyScore = casual ? undefined : scoreHonesty(message);
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

  const userMsgId = uuidv4();
  saveMessage({
    id: userMsgId,
    sessionId,
    role: "user",
    content: message,
    honestyScore,
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
        honestyScore,
        depthScore,
        relatedIdeas: relatedForClient,
        ideaId,
        ideaTitle: extractedIdea?.title ?? ideaTitle,
        agentId,
        userMessageId: userMsgId,
        assistantMessageId: assistantMsgId,
      });

      try {
        for await (const chunk of streamAgentResponse({
          agentId,
          message,
          history: history.slice(0, -1),
          relatedIdeas: relatedForPrompt,
          honestyScore,
          skipScoring: casual,
          ideaTitle: extractedIdea?.title ?? ideaTitle,
          researchBlock,
          depthScore,
        })) {
          fullResponse += chunk;
          send({ type: "chunk", content: chunk });
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
