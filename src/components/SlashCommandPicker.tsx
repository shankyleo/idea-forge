"use client";

import { useEffect, useRef } from "react";
import type { SlashCommandOption } from "@/lib/slash-commands";
import { AgentIcon } from "@/components/AgentIcon";
import { cn } from "@/lib/utils";

interface SlashCommandPickerProps {
  options: SlashCommandOption[];
  selectedIndex: number;
  onSelect: (option: SlashCommandOption) => void;
  onHighlight: (index: number) => void;
}

export function SlashCommandPicker({
  options,
  selectedIndex,
  onSelect,
  onHighlight,
}: SlashCommandPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const clampedIndex = options.length === 0 ? 0 : Math.min(selectedIndex, options.length - 1);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  if (options.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 shadow-xl">
        No matching agents
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl ring-1 ring-zinc-800"
      role="listbox"
      aria-label="Choose an agent"
    >
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Invoke agent
      </p>
      {options.map((option, index) => (
        <button
          key={option.command}
          type="button"
          data-index={index}
          role="option"
          aria-selected={index === clampedIndex}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onSelect(option)}
          className={cn(
            "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors",
            index === clampedIndex ? "bg-zinc-800" : "hover:bg-zinc-800/60"
          )}
        >
          <AgentIcon agentId={option.agentId} className="mt-0.5 h-9 w-9 shrink-0" color={option.color} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-zinc-100">{option.name}</span>
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-indigo-300">
                {option.label}
              </code>
              <span className="text-[11px] text-zinc-500">{option.persona}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">
              {option.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
