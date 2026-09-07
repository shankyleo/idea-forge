import { NextResponse } from "next/server";
import { listSessions, getSession, getMessages, createSession } from "@/lib/db";
import type { BmadAgentId } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const session = getSession(id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const messages = getMessages(id);
    return NextResponse.json({ session, messages });
  }

  return NextResponse.json({ sessions: listSessions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; agentId?: BmadAgentId };
  const session = createSession(body.title ?? "New thinking session", body.agentId ?? "forge");
  return NextResponse.json({ session });
}
