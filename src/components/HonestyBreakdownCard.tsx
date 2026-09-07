"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { HonestyBreakdown } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { cn } from "@/lib/utils";
import { averageHonestyScore, honestySpectrumStyles } from "@/lib/honesty-utils";
import { HonestyScoreRing } from "@/components/HonestyScoreRing";

interface HonestyBreakdownCardProps {
  breakdown: HonestyBreakdown;
  variant?: "coach" | "grounding";
  defaultExpanded?: boolean;
  delta?: number;
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
  const avg = averageHonestyScore(breakdown);
  const title = titleForVariant(variant);
  const avgColors = honestySpectrumStyles(avg);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors hover:brightness-110"
        style={{
          borderColor: avgColors.track,
          backgroundColor: avgColors.fill,
        }}
      >
        <span className="font-medium text-zinc-200">{title}</span>
        <span className="flex items-center gap-2">
          <HonestyScoreRing score={avg} size="sm" />
          {typeof delta === "number" && delta !== 0 && (
            <span className={cn("text-xs tabular-nums", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
              {delta > 0 ? `+${delta}` : delta}
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        </span>
      </button>
    );
  }

  return (
    <div
      className="w-full rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: avgColors.track,
        backgroundColor: avgColors.fill,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <HonestyScoreRing score={avg} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-zinc-200">{title}</p>
            {typeof delta === "number" && delta !== 0 && (
              <p className={cn("text-xs tabular-nums", delta > 0 ? "text-emerald-400" : "text-rose-400")}>
                {delta > 0 ? `+${delta}` : delta} from last score
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="shrink-0 text-zinc-500 hover:text-zinc-300"
          aria-label="Collapse breakdown"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      {variant === "coach" && breakdown.summary && (
        <p className="mt-2 text-xs text-zinc-400">{breakdown.summary}</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {breakdown.dimensions.map((d) => {
          const dimColors = honestySpectrumStyles(d.score);
          return (
            <div key={d.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-300">{d.label}</span>
                <span className="font-semibold tabular-nums" style={{ color: dimColors.text }}>
                  {d.score}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800/80">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${d.score}%`,
                    backgroundColor: dimColors.stroke,
                  }}
                />
              </div>
              {d.note && <p className="mt-0.5 text-[11px] text-zinc-500">{d.note}</p>}
            </div>
          );
        })}
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
