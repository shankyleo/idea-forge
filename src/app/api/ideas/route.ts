import { NextResponse } from "next/server";
import { listIdeas, getIdea, getIdeaLinks } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const idea = getIdea(id);
    if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const links = getIdeaLinks(id);
    return NextResponse.json({ idea, links });
  }

  return NextResponse.json({ ideas: listIdeas() });
}
