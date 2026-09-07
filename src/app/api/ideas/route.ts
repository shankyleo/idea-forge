import { NextResponse } from "next/server";
import {
  listIdeas,
  getIdea,
  getIdeaLinks,
  getAllIdeaLinks,
  getRelatedIdeasForIdea,
  getMessagesForIdeaGroup,
  listAllIdeaThoughts,
  getThoughtsForIdea,
  consolidateDuplicateSessionIdeas,
  updateIdeaPin,
} from "@/lib/db";
import { buildIdeaGroups, buildIdeaGraph } from "@/lib/idea-groups";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const grouped = searchParams.get("grouped") === "1";
  const graph = searchParams.get("graph") === "1";

  if (graph) {
    consolidateDuplicateSessionIdeas();
    const ideas = listIdeas();
    const links = getAllIdeaLinks();
    const { nodes, edges } = buildIdeaGraph(ideas, links);
    const thoughts = listAllIdeaThoughts();
    return NextResponse.json({ nodes, edges, thoughts });
  }

  if (id) {
    const idea = getIdea(id);
    if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const links = getIdeaLinks(id);
    const related = getRelatedIdeasForIdea(id);
    const thread = getMessagesForIdeaGroup(id);
    const thoughts = getThoughtsForIdea(id);
    return NextResponse.json({ idea, links, related, thread, thoughts });
  }

  const ideas = listIdeas();
  if (grouped) {
    const repair = consolidateDuplicateSessionIdeas();
    const refreshed = listIdeas();
    const links = getAllIdeaLinks();
    const groups = buildIdeaGroups(refreshed, links);
    return NextResponse.json({ ideas: refreshed, groups, links, repair });
  }

  return NextResponse.json({ ideas });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id: string; pinned?: boolean };

  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body.pinned === undefined) {
    return NextResponse.json({ error: "pinned required" }, { status: 400 });
  }

  const idea = updateIdeaPin(body.id, body.pinned);
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ idea });
}
