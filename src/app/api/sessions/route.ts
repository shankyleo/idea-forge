import { NextResponse } from "next/server";
import {
  listSessionsWithMeta,
  getSession,
  getMessages,
  createSession,
  findBestSessionForIdea,
  getMessagesForIdea,
  createSessionForIdea,
  getIdea,
  updateSession,
} from "@/lib/db";
import type { BmadAgentId } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const ideaId = searchParams.get("ideaId");
  const resume = searchParams.get("resume");

  if (ideaId) {
    const idea = getIdea(ideaId);
    if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

    let sessionId = findBestSessionForIdea(ideaId);
    let session = sessionId ? getSession(sessionId) : null;
    if (!session) {
      session = createSessionForIdea(ideaId);
      sessionId = session.id;
    }

    const thread = getMessagesForIdea(ideaId);
    return NextResponse.json({
      idea,
      session,
      thread,
      messages: getMessages(session.id),
    });
  }

  if (id) {
    const session = getSession(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const messages = getMessages(id);
    return NextResponse.json({ session, messages });
  }

  const sessions = listSessionsWithMeta();

  if (resume === "1") {
    const lastId = searchParams.get("lastId");
    if (lastId) {
      const session = getSession(lastId);
      if (session) {
        return NextResponse.json({
          session: { ...session, messageCount: getMessages(lastId).length },
          messages: getMessages(lastId),
          sessions,
        });
      }
    }
  }

  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    agentId?: BmadAgentId;
    ideaId?: string;
  };

  if (body.ideaId) {
    const session = createSessionForIdea(body.ideaId);
    return NextResponse.json({ session });
  }

  const session = createSession(body.title ?? "New thinking session", body.agentId ?? "deep-recon");
  return NextResponse.json({ session });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    id: string;
    title?: string;
    activeIdeaId?: string | null;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const session = getSession(body.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  updateSession(body.id, {
    title: body.title,
    activeIdeaId: body.activeIdeaId === null ? undefined : body.activeIdeaId,
  });

  return NextResponse.json({ session: getSession(body.id) });
}
