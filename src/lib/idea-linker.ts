import { listIdeas, saveIdeaLink } from "@/lib/db";
import type { IdeaLink, IdeaRecord } from "@/lib/types";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export function findRelatedIdeas(
  content: string,
  currentIdeaId?: string
): Array<{ idea: IdeaRecord; score: number; reason: string }> {
  const ideas = listIdeas().filter((i) => i.id !== currentIdeaId);
  if (ideas.length === 0) return [];

  const contentTokens = tokenize(content);
  const results = ideas
    .map((idea) => {
      const ideaText = `${idea.title} ${idea.summary} ${idea.tags.join(" ")}`;
      const ideaTokens = tokenize(ideaText);
      const similarity = jaccard(contentTokens, ideaTokens);

      const sharedTags = idea.tags.filter((t) => content.toLowerCase().includes(t));
      const tagBoost = sharedTags.length * 0.15;
      const score = Math.min(1, similarity + tagBoost);

      let reason = "Shared vocabulary";
      if (sharedTags.length > 0) reason = `Shared tags: ${sharedTags.join(", ")}`;
      else if (similarity > 0.2) reason = "Similar topic and keywords";

      return { idea, score, reason };
    })
    .filter((r) => r.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return results;
}

export function linkRelatedIdeas(
  ideaId: string,
  related: Array<{ idea: IdeaRecord; score: number; reason: string }>
) {
  for (const r of related) {
    saveIdeaLink({
      ideaId,
      relatedId: r.idea.id,
      score: r.score,
      reason: r.reason,
    });
  }
}
