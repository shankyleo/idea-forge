import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";

export interface SlashCommandMatch {
  agentId: BmadAgentId;
  /** Message body after the command (may be empty). */
  body: string;
  command: string;
}

const SLASH_ALIASES: Record<string, BmadAgentId> = {
  honesty: "honesty-coach",
  "honesty-coach": "honesty-coach",
  recon: "deep-recon",
  research: "deep-recon",
  "deep-recon": "deep-recon",
  forge: "forge",
  brainstorm: "brainstorm",
  carson: "brainstorm",
  review: "red-team",
  reviewer: "red-team",
  "red-team": "red-team",
  maya: "design-thinking",
  design: "design-thinking",
  "design-thinking": "design-thinking",
  victor: "innovation",
  innovation: "innovation",
  quinn: "problem-solving",
  "problem-solving": "problem-solving",
  party: "party-mode",
  "party-mode": "party-mode",
};

/** User-facing slash commands shown in the chat hint. */
export const SLASH_COMMAND_HINTS: Array<{ command: string; agentId: BmadAgentId }> = [
  { command: "/forge", agentId: "forge" },
  { command: "/recon", agentId: "deep-recon" },
  { command: "/honesty", agentId: "honesty-coach" },
  { command: "/review", agentId: "red-team" },
  { command: "/maya", agentId: "design-thinking" },
  { command: "/victor", agentId: "innovation" },
  { command: "/brainstorm", agentId: "brainstorm" },
  { command: "/quinn", agentId: "problem-solving" },
  { command: "/party", agentId: "party-mode" },
];

export interface SlashCommandOption {
  command: string;
  label: string;
  agentId: BmadAgentId;
  name: string;
  persona: string;
  description: string;
  color: string;
}

export function getSlashCommandOptions(): SlashCommandOption[] {
  return SLASH_COMMAND_HINTS.map(({ command, agentId }) => {
    const agent = getAgent(agentId);
    return {
      command: command.slice(1),
      label: command,
      agentId,
      name: agent.name,
      persona: agent.persona,
      description: agent.description,
      color: agent.color,
    };
  });
}

/** True while the user is picking a slash command (before the trailing space). */
export function getSlashPickerQuery(input: string): string | null {
  const match = input.match(/^\/(\w*)$/);
  return match ? match[1].toLowerCase() : null;
}

export function filterSlashCommandOptions(query: string): SlashCommandOption[] {
  const options = getSlashCommandOptions();
  if (!query) return options;
  return options.filter(
    (o) =>
      o.command.startsWith(query) ||
      o.name.toLowerCase().includes(query) ||
      o.persona.toLowerCase().includes(query) ||
      o.description.toLowerCase().includes(query)
  );
}

export function parseSlashCommand(raw: string): SlashCommandMatch | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\/([a-z-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;

  const command = match[1].toLowerCase();
  const agentId = SLASH_ALIASES[command];
  if (!agentId) return null;

  return {
    agentId,
    body: (match[2] ?? "").trim(),
    command,
  };
}

export function slashRouteReason(command: string): string {
  const agent = getAgent(SLASH_ALIASES[command] ?? "forge");
  return `You invoked /${command} — ${agent.name} is responding`;
}
