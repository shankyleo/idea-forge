"use client";

import { cn } from "@/lib/utils";
import { honestySpectrumStyles } from "@/lib/honesty-utils";

type RingSize = "sm" | "md";

const RING = {
  sm: { box: 36, stroke: 2.5, font: "text-[11px]" },
  md: { box: 44, stroke: 3, font: "text-base" },
} as const;

interface HonestyScoreRingProps {
  score: number;
  size?: RingSize;
  className?: string;
  title?: string;
}

export function HonestyScoreRing({
  score,
  size = "md",
  className,
  title,
}: HonestyScoreRingProps) {
  const { box, stroke, font } = RING[size];
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const colors = honestySpectrumStyles(clamped);
  const center = box / 2;

  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
      title={title ?? `Honesty score ${clamped}`}
      aria-label={title ?? `Honesty score ${clamped}`}
    >
      <svg
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className="absolute inset-0"
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill={colors.fill}
          stroke={colors.track}
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ stroke: colors.stroke }}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center font-bold tabular-nums leading-none",
          font
        )}
        style={{ color: colors.text }}
      >
        {clamped}
      </div>
    </div>
  );
}
