"use client";

import type { HonestyScore } from "@/lib/types";
import { honestyBg, honestyColor } from "@/lib/honesty-scorer";
import { cn } from "@/lib/utils";

interface HonestyBadgeProps {
  score: HonestyScore;
  compact?: boolean;
}

export function HonestyBadge({ score, compact }: HonestyBadgeProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        honestyBg(score.overall)
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-300">Honesty score</span>
        <span className={cn("text-lg font-bold tabular-nums", honestyColor(score.overall))}>
          {score.overall}/100
        </span>
      </div>
      {!compact && (
        <>
          <p className="mt-1 text-xs text-zinc-400">{score.summary}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-zinc-500">
            <span>Evidence: {score.evidence}</span>
            <span>Specificity: {score.specificity}</span>
            <span>Assumptions: {score.assumptions}</span>
            <span>Feasibility: {score.feasibility}</span>
          </div>
          {score.flags.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-300/90">
              {score.flags.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
