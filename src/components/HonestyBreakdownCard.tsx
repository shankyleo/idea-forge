"use client";

import type { HonestyBreakdown } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HonestyBreakdownCardProps {
  breakdown: HonestyBreakdown;
  compact?: boolean;
  delta?: number;
}

function barColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function textColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function HonestyBreakdownCard({ breakdown, compact, delta }: HonestyBreakdownCardProps) {
  return (
    <div className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-sm">
      <p className="font-medium text-teal-200">
        {compact ? "Idea grounding" : "Honesty Coach breakdown"}
        {typeof delta === "number" && delta !== 0 && (
          <span className={cn("ml-2 text-xs", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
            {delta > 0 ? `+${delta}` : delta} this turn
          </span>
        )}
      </p>
      {!compact && breakdown.summary && (
        <p className="mt-1 text-xs text-zinc-400">{breakdown.summary}</p>
      )}
      <div className="mt-2 space-y-2">
        {breakdown.dimensions.map((d) => (
          <div key={d.id}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-300">{d.label}</span>
              <span className={cn("font-semibold tabular-nums", textColor(d.score))}>
                {d.score}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn("h-full rounded-full transition-all", barColor(d.score))}
                style={{ width: `${d.score}%` }}
              />
            </div>
            {!compact && d.note && (
              <p className="mt-0.5 text-[11px] text-zinc-500">{d.note}</p>
            )}
          </div>
        ))}
      </div>
      {breakdown.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-300/90">
          {breakdown.flags.map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
