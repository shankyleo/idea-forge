import type {
  IdeaLink,
  IdeaRecord,
  IdeaGroup,
  IdeaGraph,
  IdeaGraphEdge,
} from "@/lib/types";

export type { IdeaGroup };

/** Union-find clustering on idea link graph */
export function buildIdeaGroups(
  ideas: IdeaRecord[],
  links: IdeaLink[]
): IdeaGroup[] {
  if (ideas.length === 0) return [];

  const parent = new Map<string, string>();
  for (const idea of ideas) parent.set(idea.id, idea.id);

  function find(id: string): string {
    const p = parent.get(id)!;
    if (p !== id) parent.set(id, find(p));
    return parent.get(id)!;
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  const linkReasons = new Map<string, string>();
  for (const link of links) {
    if (link.score >= 0.08) {
      union(link.ideaId, link.relatedId);
      const key = [link.ideaId, link.relatedId].sort().join(":");
      if (!linkReasons.has(key)) linkReasons.set(key, link.reason);
    }
  }

  const byRoot = new Map<string, IdeaRecord[]>();
  for (const idea of ideas) {
    const root = find(idea.id);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(idea);
  }

  const groups: IdeaGroup[] = [...byRoot.values()].map((members) => {
    const sorted = [...members].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    const sharedTags = intersectTags(sorted);
    const label =
      sorted.length === 1
        ? sorted[0].title.slice(0, 48)
        : sharedTags.length > 0
          ? `${sharedTags.slice(0, 2).join(" · ")} cluster`
          : `${sorted[0].title.slice(0, 32)} + ${sorted.length - 1} related`;

    return {
      id: sorted[0].id,
      label,
      ideas: sorted,
      connectionReason:
        sorted.length > 1 ? "Linked by shared topic, tags, or keywords" : undefined,
    };
  });

  return groups.sort(
    (a, b) =>
      new Date(b.ideas[0].updatedAt).getTime() - new Date(a.ideas[0].updatedAt).getTime()
  );
}

function intersectTags(ideas: IdeaRecord[]): string[] {
  if (ideas.length === 0) return [];
  return ideas[0].tags.filter((tag) => ideas.every((i) => i.tags.includes(tag)));
}

/**
 * Build a node/edge graph for the visual Idea map. Nodes carry the cluster
 * (group) they belong to so the UI can color related ideas together; edges are
 * the idea links, collapsed to a single undirected edge per pair keeping the
 * strongest score and its reason.
 */
export function buildIdeaGraph(ideas: IdeaRecord[], links: IdeaLink[]): IdeaGraph {
  const groups = buildIdeaGroups(ideas, links);
  const groupOf = new Map<string, { id: string; index: number; label: string }>();
  groups.forEach((group, index) => {
    for (const idea of group.ideas) {
      groupOf.set(idea.id, { id: group.id, index, label: group.label });
    }
  });

  const nodes = ideas.map((idea) => {
    const g = groupOf.get(idea.id);
    return {
      id: idea.id,
      title: idea.title,
      summary: idea.summary,
      tags: idea.tags,
      status: idea.status,
      groupId: g?.id ?? idea.id,
      groupIndex: g?.index ?? 0,
      groupLabel: g?.label ?? idea.title,
    };
  });

  const ideaIds = new Set(ideas.map((i) => i.id));
  const edgeByPair = new Map<string, IdeaGraphEdge>();
  for (const link of links) {
    if (!ideaIds.has(link.ideaId) || !ideaIds.has(link.relatedId)) continue;
    if (link.ideaId === link.relatedId) continue;
    const [a, b] = [link.ideaId, link.relatedId].sort();
    const key = `${a}:${b}`;
    const existing = edgeByPair.get(key);
    if (!existing || link.score > existing.score) {
      edgeByPair.set(key, { source: a, target: b, score: link.score, reason: link.reason });
    }
  }

  return { nodes, edges: [...edgeByPair.values()] };
}
