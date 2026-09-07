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
