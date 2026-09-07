"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HonestyBreakdown } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { cn } from "@/lib/utils";

interface HonestyBreakdownCardProps {
  breakdown: HonestyBreakdown;
  variant?: "coach" | "grounding";
  defaultExpanded?: boolean;
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

function averageScore(breakdown: HonestyBreakdown): number {
  if (breakdown.dimensions.length === 0) return 0;
  return Math.round(
    breakdown.dimensions.reduce((s, d) => s + d.score, 0) / breakdown.dimensions.length
  );
}

function titleForVariant(variant: "coach" | "grounding"): string {
  if (variant === "coach") {
    return `${getAgent("honesty-coach").name}'s breakdown`;
  }
  return "Honesty breakdown";
}

export function HonestyBreakdownCard({
  breakdown,
  variant = "grounding",
  defaultExpanded = false,
  delta,
}: HonestyBreakdownCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const avg = averageScore(breakdown);
  const title = titleForVariant(variant);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-2.5 text-left text-sm hover:bg-teal-500/15"
      >
        <span className="font-medium text-teal-200">{title}</span>
        <span className="flex items-center gap-2">
          <span className={cn("font-semibold tabular-nums", textColor(avg))}>{avg}/100</span>
          {typeof delta === "number" && delta !== 0 && (
            <span className={cn("text-xs tabular-nums", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-teal-300/70" />
        </span>
      </button>
    );
  }

  return (
    <div className="w-full rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-teal-200">
          {title}
          <span className={cn("ml-2 tabular-nums", textColor(avg))}>{avg}/100</span>
          {typeof delta === "number" && delta !== 0 && (
            <span className={cn("ml-2 text-xs", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
              {delta > 0 ? `+${delta}` : delta} this turn
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-teal-300/70 hover:text-teal-200"
          aria-label="Collapse breakdown"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      {variant === "coach" && breakdown.summary && (
        <p className="mt-1 text-xs text-zinc-400">{breakdown.summary}</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {breakdown.dimensions.map((d) => (
          <div key={d.id}>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-300">{d.label}</span>
              <span className={cn("font-semibold tabular-nums", textColor(d.score))}>
                {d.score}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn("h-full rounded-full transition-all", barColor(d.score))}
                style={{ width: `${d.score}%` }}
              />
            </div>
            {d.note && <p className="mt-0.5 text-[11px] text-zinc-500">{d.note}</p>}
          </div>
        ))}
      </div>
      {breakdown.flags.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-amber-300/90">
          {breakdown.flags.slice(0, 4).map((f) => (
            <li key={f}>• {f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
