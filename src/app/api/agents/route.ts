import { NextResponse } from "next/server";
import { BMAD_AGENTS } from "@/lib/bmad/agents";
import { hasCursorApiKey } from "@/lib/cursor-agent";

export async function GET() {
  return NextResponse.json({
    agents: BMAD_AGENTS,
    cursorApiConfigured: hasCursorApiKey(),
  });
}
