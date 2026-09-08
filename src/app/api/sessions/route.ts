import { NextResponse } from "next/server";
import {
  listSessionsWithMeta,
  getSession,
  getMessages,
  createSession,
  findBestSessionForIdea,
  getMessagesForIdeaGroup,
  createSessionForIdea,
  getIdea,
  updateSession,
  getIdeaHonestySnapshot,
  upsertIdea,
  repairGenericSessionTitles,
  getAppForChatSession,
} from "@/lib/db";
import { resolveSessionDisplayTitle } from "@/lib/session-titles";
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

    const thread = getMessagesForIdeaGroup(ideaId);
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
    const ideaId =
      session.activeIdeaId ??
      [...messages].reverse().find((m) => m.ideaId)?.ideaId;
    const idea = ideaId ? getIdea(ideaId) ?? undefined : undefined;
    const ideaHonesty = ideaId ? getIdeaHonestySnapshot(ideaId) ?? undefined : undefined;
    const firstUserMessage = messages.find((m) => m.role === "user")?.content;
    const displayTitle = resolveSessionDisplayTitle({
      sessionTitle: session.title,
      ideaTitle: idea?.title,
      firstUserMessage,
    });
    return NextResponse.json({ session, messages, ideaHonesty, idea, displayTitle });
  }

  repairGenericSessionTitles();
  const sessions = listSessionsWithMeta();

  if (resume === "1") {
    const lastId = searchParams.get("lastId");
    if (lastId) {
      const session = getSession(lastId);
      if (session && !getAppForChatSession(lastId)) {
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
    pinned?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const session = getSession(body.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  updateSession(body.id, {
    title: body.title,
    activeIdeaId: body.activeIdeaId === null ? undefined : body.activeIdeaId,
    pinned: body.pinned,
  });

  if (body.title?.trim() && session.activeIdeaId) {
    const idea = getIdea(session.activeIdeaId);
    if (idea) {
      upsertIdea({
        id: idea.id,
        title: body.title.trim().slice(0, 200),
        summary: idea.summary,
        tags: idea.tags,
        status: idea.status,
      });
    }
  }

  const updated = getSession(body.id)!;
  const idea = updated.activeIdeaId ? getIdea(updated.activeIdeaId) ?? undefined : undefined;
  const messages = getMessages(body.id);
  const firstUserMessage = messages.find((m) => m.role === "user")?.content;
  const displayTitle = resolveSessionDisplayTitle({
    sessionTitle: updated.title,
    ideaTitle: idea?.title,
    firstUserMessage,
  });

  return NextResponse.json({ session: updated, displayTitle });
}
