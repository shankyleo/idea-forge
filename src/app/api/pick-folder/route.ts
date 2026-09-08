import { NextResponse } from "next/server";
import { pickLocalFolder } from "@/lib/promote-app";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST() {
  const result = pickLocalFolder();
  if (result.ok) return NextResponse.json({ path: result.path });
  if ("cancelled" in result) return NextResponse.json({ cancelled: true });
  return NextResponse.json({ error: result.error }, { status: 400 });
}
