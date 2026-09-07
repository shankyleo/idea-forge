import type { AgentPerspective, ChatMessage, HonestyBreakdown } from "@/lib/types";
import { isCasualMessage } from "@/lib/message-utils";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { parseSlashCommand } from "@/lib/slash-commands";

export type ChatTurn = { user: ChatMessage; assistant?: ChatMessage };

export type TurnHonesty = {
  breakdown: HonestyBreakdown;
  score: number;
  delta?: number;
};

export function averageHonestyScore(breakdown: HonestyBreakdown): number {
  if (breakdown.dimensions.length === 0) return 0;
  return Math.round(
    breakdown.dimensions.reduce((s, d) => s + d.score, 0) / breakdown.dimensions.length
  );
}

export function honestySpectrumStyles(score: number): {
  stroke: string;
  text: string;
  fill: string;
  track: string;
} {
  const t = Math.max(0, Math.min(100, score)) / 100;
  // 8° ≈ red → 145° ≈ green
  const hue = 8 + t * 137;
  return {
    stroke: `hsl(${hue} 78% 52%)`,
    text: `hsl(${hue} 86% 64%)`,
    fill: `hsla(${hue} 78% 52% / 0.14)`,
    track: `hsla(${hue} 25% 42% / 0.22)`,
  };
}

export function honestyScoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function honestyRingColor(score: number): string {
  if (score >= 75) return "border-emerald-500/50 bg-emerald-500/10";
  if (score >= 50) return "border-amber-500/50 bg-amber-500/10";
  return "border-rose-500/50 bg-rose-500/10";
}

/** Honesty for a turn — prefer stored breakdown from the server, else compute for legacy rows. */
export function getTurnHonestyBreakdown(
  turn: ChatTurn,
  ideaHonesty: HonestyBreakdown | null,
  isLastTurn: boolean,
  livePanel?: AgentPerspective[] | null
): HonestyBreakdown | undefined {
  if (turn.user.honestyBreakdown) return turn.user.honestyBreakdown;

  if (!turn.user.content || isCasualMessage(turn.user.content)) return undefined;

  const slash = parseSlashCommand(turn.user.content.trim());
  if (slash) return undefined;

  if (isLastTurn && ideaHonesty) return ideaHonesty;

  const perspectives = turn.assistant?.perspectives ?? livePanel ?? [];
  const panelText = perspectives.map((p) => p.content).join("\n");
  const combined = [turn.user.content, panelText].filter(Boolean).join("\n\n");
  return scoreHonesty(combined, {
    hasResearch: Boolean(turn.assistant?.depthScore ?? livePanel?.length),
    depthScore: turn.assistant?.depthScore?.overall,
    competitionLevel: turn.assistant?.depthScore?.competitionLevel,
  });
}

export function getTurnHonestyScores(input: {
  turns: ChatTurn[];
  ideaHonesty?: HonestyBreakdown | null;
  livePanel?: AgentPerspective[] | null;
}): TurnHonesty[] {
  const { turns, ideaHonesty, livePanel } = input;
  const out: TurnHonesty[] = [];
  let prevScore: number | undefined;

  for (let i = 0; i < turns.length; i++) {
    const breakdown = getTurnHonestyBreakdown(
      turns[i],
      ideaHonesty ?? null,
      i === turns.length - 1,
      i === turns.length - 1 ? livePanel : null
    );
    if (!breakdown) continue;

    const score = averageHonestyScore(breakdown);
    const delta = prevScore !== undefined ? score - prevScore : undefined;
    out.push({
      breakdown,
      score,
      delta: delta !== 0 ? delta : undefined,
    });
    prevScore = score;
  }

  return out;
}

export function latestVisibleChatHonesty(input: {
  turns: ChatTurn[];
  ideaHonesty?: HonestyBreakdown | null;
  liveDelta?: number;
  isLiveTurn?: boolean;
  livePanel?: AgentPerspective[] | null;
}): { score: number; delta?: number } | null {
  const scores = getTurnHonestyScores(input);

  if (scores.length === 0) return null;

  const last = scores[scores.length - 1];

  if (input.isLiveTurn && typeof input.liveDelta === "number" && input.liveDelta !== 0) {
    return { score: last.score, delta: input.liveDelta };
  }

  return { score: last.score, delta: last.delta };
}

export function turnHonestyByUserId(
  turns: ChatTurn[],
  ideaHonesty: HonestyBreakdown | null,
  livePanel?: AgentPerspective[] | null
): Map<string, TurnHonesty> {
  const map = new Map<string, TurnHonesty>();
  let prevScore: number | undefined;

  for (let i = 0; i < turns.length; i++) {
    const breakdown = getTurnHonestyBreakdown(
      turns[i],
      ideaHonesty,
      i === turns.length - 1,
      i === turns.length - 1 ? livePanel : null
    );
    if (!breakdown) continue;

    const score = averageHonestyScore(breakdown);
    const delta = prevScore !== undefined ? score - prevScore : undefined;
    map.set(turns[i].user.id, {
      breakdown,
      score,
      delta: delta !== 0 ? delta : undefined,
    });
    prevScore = score;
  }

  return map;
}
