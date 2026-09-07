import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|hiya|howdy|thanks|thank you|ok|okay|help|start|good morning|good evening)[\s!.?]*$/i;

const IDEA_HINT_PATTERN =
  /\b(app|saas|startup|product|idea|build|create|market|business|platform|tool|service|freelancer|mobile|ai)\b/i;

// Forge/red-team action commands are never casual — they act on the previous idea.
const ACTION_COMMAND_PATTERN =
  /^(attack this|defend this|what'?s missing)([\s.!?].*)?$/i;

export function isCasualMessage(text: string): boolean {
  const trimmed = text.trim();
  if (ACTION_COMMAND_PATTERN.test(trimmed)) return false;
  if (trimmed.length < 20 && !IDEA_HINT_PATTERN.test(trimmed)) return true;
  if (GREETING_PATTERN.test(trimmed)) return true;
  return false;
}

export function shouldRunWebResearch(agentId: BmadAgentId, message: string): boolean {
  return agentId === "deep-recon" && !isCasualMessage(message);
}

/** Run market research to inform the panel on any substantive idea message. */
export function shouldRunPanelResearch(message: string): boolean {
  return !isCasualMessage(message) && message.trim().length >= 20;
}

export function casualReply(agentId: BmadAgentId): string {
  if (agentId === "honesty-coach") {
    const level = getAgent("honesty-coach");
    return `Hey! I'm **${level.name}**, ${level.persona}. Share an app or business idea and I'll break down how grounded your claims are — six dimensions, no single overall score.

Example: "I want to build a SaaS for freelancers. There's no competition and it'll be easy."`;
  }

  if (agentId === "deep-recon") {
    const mary = getAgent("deep-recon");
    return `Hey! I'm **${mary.name}**, ${mary.persona}. I search the web and score whether your idea has real market depth.

Share something specific, for example:
- "SaaS for freelancers to track invoices"
- "AI app that helps restaurants manage inventory"

When you share a real idea, I'll run live market research and show a depth score.`;
  }

  const level = getAgent("honesty-coach");
  return `Hey! I'm ready when you are. Describe an app idea, business concept, or problem you want to think through — try **/honesty** when you want ${level.name} to check your claims.`;
}
