"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { HonestyScoreRing } from "@/components/HonestyScoreRing";

interface HonestyScoreBadgeProps {
  score: number;
  delta?: number;
  className?: string;
}

export function HonestyScoreBadge({ score, delta, className }: HonestyScoreBadgeProps) {
  const title =
    typeof delta === "number" && delta !== 0
      ? delta > 0
        ? `Honesty score ${score} — up ${delta} from last shown score`
        : `Honesty score ${score} — down ${Math.abs(delta)} from last shown score`
      : `Honesty score ${score}`;

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={title}
      aria-label={title}
    >
      <HonestyScoreRing score={score} size="md" title={title} />
      {typeof delta === "number" && delta !== 0 && (
        <span
          className={cn(
            "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            delta > 0
              ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25"
              : "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/25"
          )}
        >
          {delta > 0 ? (
            <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          )}
          {Math.abs(delta)}
        </span>
      )}
    </div>
  );
}
