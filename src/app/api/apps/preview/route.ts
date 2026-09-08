import { NextResponse } from "next/server";
import { getApp } from "@/lib/db";
import { ensureAppPreview } from "@/lib/app-preview";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const body = (await request.json()) as { id?: string };
  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (!getApp(body.id)) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  const result = await ensureAppPreview(body.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ url: result.url, port: result.port, app: getApp(body.id) });
}
