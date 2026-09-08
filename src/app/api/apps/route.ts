import { NextResponse } from "next/server";
import { getApp, getAppForIdea, getAppForSession, getSession, listApps, ensureAppChatSession } from "@/lib/db";
import { attachGithubToApp, promoteToApp } from "@/lib/promote-app";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const ideaId = searchParams.get("ideaId");
  const sessionId = searchParams.get("sessionId");

  if (id) {
    const app = getApp(id);
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ app: ensureAppChatSession(app) });
  }

  if (ideaId) {
    const app = getAppForIdea(ideaId);
    return NextResponse.json({ app: app ? ensureAppChatSession(app) : null });
  }

  if (sessionId) {
    const app = getAppForSession(sessionId);
    return NextResponse.json({ app: app ? ensureAppChatSession(app) : null });
  }

  return NextResponse.json({ apps: listApps() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    ideaId?: string;
    localPath?: string;
    githubRepo?: string;
  };

  if (!body.sessionId?.trim() || !body.localPath?.trim()) {
    return NextResponse.json({ error: "sessionId and localPath are required" }, { status: 400 });
  }

  if (!getSession(body.sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const result = promoteToApp({
    sessionId: body.sessionId,
    ideaId: body.ideaId,
    localPath: body.localPath,
    githubRepo: body.githubRepo,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ app: result.app });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id?: string; githubRepo?: string };

  if (!body.id?.trim() || !body.githubRepo?.trim()) {
    return NextResponse.json({ error: "id and githubRepo are required" }, { status: 400 });
  }

  const result = attachGithubToApp(body.id, body.githubRepo);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ app: result.app });
}
