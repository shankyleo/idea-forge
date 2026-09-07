"use client";

import type { AgentInfo, BmadAgentId } from "@/lib/types";
import { AgentIcon } from "@/components/AgentIcon";
import { cn } from "@/lib/utils";

interface AgentPickerProps {
  agents: AgentInfo[];
  selected: BmadAgentId;
  onSelect: (id: BmadAgentId) => void;
}

export function AgentPicker({ agents, selected, onSelect }: AgentPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((agent) => (
        <button
          key={agent.id}
          type="button"
          onClick={() => onSelect(agent.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs transition-all",
            selected === agent.id
              ? "border-white/30 bg-white/10 text-white shadow-sm"
              : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          )}
          style={
            selected === agent.id
              ? { borderColor: agent.color, boxShadow: `0 0 12px ${agent.color}33` }
              : undefined
          }
        >
          <AgentIcon agentId={agent.id} className="h-7 w-7" color={agent.color} />
          <span className="font-semibold">{agent.name}</span>
          <span className="hidden text-zinc-500 sm:inline">· {agent.persona}</span>
        </button>
      ))}
    </div>
  );
}
