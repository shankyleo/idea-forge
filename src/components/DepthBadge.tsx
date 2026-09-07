"use client";

import type { DepthScore } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

interface DepthBadgeProps {
  score: DepthScore;
  compact?: boolean;
}

function depthColor(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-rose-400";
}

function depthBg(score: number): string {
  if (score >= 65) return "bg-blue-500/15 border-blue-500/30";
  if (score >= 45) return "bg-amber-500/15 border-amber-500/30";
  return "bg-rose-500/15 border-rose-500/30";
}

export function DepthBadge({ score, compact }: DepthBadgeProps) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-sm", depthBg(score.overall))}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-medium text-zinc-300">
          <Search className="h-3.5 w-3.5 text-blue-400" />
          Idea depth
        </span>
        <span className={cn("text-lg font-bold tabular-nums", depthColor(score.overall))}>
          {score.overall}/100
        </span>
      </div>
      {!compact && (
        <>
          <p className="mt-1 text-xs text-zinc-400">{score.verdict}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Competition: <span className="capitalize text-zinc-400">{score.competitionLevel}</span>
          </p>
          {score.signals.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-blue-300/90">
              {score.signals.map((s) => (
                <li key={s}>• {s}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
