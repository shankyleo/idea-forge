import { NextResponse } from "next/server";
import {
  listIdeas,
  getIdea,
  getIdeaLinks,
  getAllIdeaLinks,
  getRelatedIdeasForIdea,
  getMessagesForIdeaGroup,
} from "@/lib/db";
import { buildIdeaGroups, buildIdeaGraph } from "@/lib/idea-groups";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const grouped = searchParams.get("grouped") === "1";
  const graph = searchParams.get("graph") === "1";

  if (graph) {
    const ideas = listIdeas();
    const links = getAllIdeaLinks();
    const { nodes, edges } = buildIdeaGraph(ideas, links);
    return NextResponse.json({ nodes, edges });
  }

  if (id) {
    const idea = getIdea(id);
    if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const links = getIdeaLinks(id);
    const related = getRelatedIdeasForIdea(id);
    const thread = getMessagesForIdeaGroup(id);
    return NextResponse.json({ idea, links, related, thread });
  }

  const ideas = listIdeas();
  if (grouped) {
    const links = getAllIdeaLinks();
    const groups = buildIdeaGroups(ideas, links);
    return NextResponse.json({ ideas, groups, links });
  }

  return NextResponse.json({ ideas });
}
