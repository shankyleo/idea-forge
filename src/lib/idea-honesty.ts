import type { AgentPerspective, HonestyBreakdown, HonestyDimension } from "@/lib/types";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { getIdeaHonestySnapshot, updateIdeaHonestySnapshot } from "@/lib/db";

function blendDimensions(prior: HonestyDimension[], next: HonestyDimension[]): HonestyDimension[] {
  const priorById = new Map(prior.map((d) => [d.id, d]));
  return next.map((d) => {
    const old = priorById.get(d.id);
    if (!old) return d;
    const score = Math.round(old.score * 0.35 + d.score * 0.65);
    return {
      ...d,
      score,
      note: d.note || old.note,
    };
  });
}

export function computeIdeaHonestyUpdate(input: {
  ideaId: string;
  userMessage: string;
  perspectives?: AgentPerspective[];
  assistantResponse?: string;
  competitionLevel?: "low" | "medium" | "high" | "unknown";
  depthScore?: number;
  hasResearch?: boolean;
}): { breakdown: HonestyBreakdown; delta?: number } {
  const panelText = (input.perspectives ?? [])
    .map((p) => `${p.name} (${p.role}): ${p.content}`)
    .join("\n");

  const combined = [input.userMessage, panelText, input.assistantResponse]
    .filter(Boolean)
    .join("\n\n");

  const next = scoreHonesty(combined, {
    competitionLevel: input.competitionLevel,
    depthScore: input.depthScore,
    hasResearch: input.hasResearch,
  });

  const prior = getIdeaHonestySnapshot(input.ideaId);
  if (!prior) {
    updateIdeaHonestySnapshot(input.ideaId, next);
    return { breakdown: next };
  }

  const blended: HonestyBreakdown = {
    dimensions: blendDimensions(prior.dimensions, next.dimensions),
    flags: [...new Set([...next.flags, ...prior.flags])].slice(0, 4),
    summary: next.summary,
  };

  const priorAvg =
    prior.dimensions.reduce((s, d) => s + d.score, 0) / Math.max(prior.dimensions.length, 1);
  const nextAvg =
    blended.dimensions.reduce((s, d) => s + d.score, 0) / Math.max(blended.dimensions.length, 1);
  const delta = Math.round(nextAvg - priorAvg);

  updateIdeaHonestySnapshot(input.ideaId, blended);
  return { breakdown: blended, delta };
}
