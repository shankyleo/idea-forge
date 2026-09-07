"use client";

import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { AgentIcon } from "@/components/AgentIcon";
import { cn } from "@/lib/utils";

interface AgentReplyHeaderProps {
  agentId: BmadAgentId;
  routeReason?: string;
  invokedViaSlash?: boolean;
  slashCommand?: string;
}

export function AgentReplyHeader({
  agentId,
  routeReason,
  invokedViaSlash,
  slashCommand,
}: AgentReplyHeaderProps) {
  const agent = getAgent(agentId);
  const invoked =
    invokedViaSlash ?? Boolean(routeReason?.startsWith("You invoked /"));
  const command =
    slashCommand ?? routeReason?.match(/You invoked \/(\S+)/)?.[1];

  if (invoked) {
    return (
      <div
        className="mb-4 flex items-center gap-4 rounded-xl border px-4 py-3"
        style={{
          borderColor: `${agent.color}66`,
          backgroundColor: `${agent.color}14`,
          boxShadow: `0 0 24px ${agent.color}18`,
        }}
      >
        <AgentIcon agentId={agentId} className="h-14 w-14 shrink-0" color={agent.color} />
        <div className="min-w-0 flex-1">
          {command && (
            <span
              className="mb-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: `${agent.color}28`, color: agent.color }}
            >
              /{command} invoked
            </span>
          )}
          <p className="text-lg font-semibold leading-tight text-zinc-50">{agent.name}</p>
          <p className="text-sm text-zinc-400">{agent.persona}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-center gap-2.5">
      <AgentIcon agentId={agentId} className="h-8 w-8 shrink-0" color={agent.color} />
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: agent.color }}>
          {agent.name}
        </p>
        <p className="text-[11px] text-zinc-500">{agent.persona}</p>
        {routeReason && <p className="mt-0.5 text-[10px] text-zinc-600">{routeReason}</p>}
      </div>
    </div>
  );
}

export function AgentReplyHeaderCompact({
  agentId,
  className,
}: {
  agentId: BmadAgentId;
  className?: string;
}) {
  const agent = getAgent(agentId);
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5", className)}
      style={{ borderColor: `${agent.color}55`, backgroundColor: `${agent.color}12` }}
    >
      <AgentIcon agentId={agentId} className="h-7 w-7" color={agent.color} />
      <span className="text-sm font-semibold" style={{ color: agent.color }}>
        {agent.name}
      </span>
    </div>
  );
}
