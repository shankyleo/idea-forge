import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|hiya|howdy|thanks|thank you|ok|okay|help|start|good morning|good evening)[\s!.?]*$/i;

const IDEA_HINT_PATTERN =
  /\b(app|saas|startup|product|idea|build|create|market|business|platform|tool|service|freelancer|mobile|ai)\b/i;

// Forge/red-team action commands are never casual — they act on the previous idea.
const ACTION_COMMAND_PATTERN =
  /^(attack this|defend this|what'?s missing)([\s.!?].*)?$/i;

const FOLLOW_UP_PATTERN =
  /^(what do you think|what about|how about|can you|could you|would you|do you|tell me|explain|clarify|why|how|what|and |but |also |not sure|maybe|i think|thanks|thank you|ok|okay|yes|no\b)/i;

const NEW_IDEA_PATTERN =
  /\b(i have an idea|new idea|different idea|another idea|i want to|thinking about|considering|what if|build a|create a|startup|product idea)\b/i;

export function isFollowUpMessage(text: string): boolean {
  const trimmed = text.trim();
  if (ACTION_COMMAND_PATTERN.test(trimmed)) return true;
  if (trimmed.length < 25 && !NEW_IDEA_PATTERN.test(trimmed)) return true;
  if (FOLLOW_UP_PATTERN.test(trimmed)) return true;
  if (trimmed.endsWith("?") && !NEW_IDEA_PATTERN.test(trimmed)) return true;
  return false;
}

/** Only the first substantive message in a thread should mint a new idea record. */
export function shouldExtractNewIdea(message: string, priorUserMessages: number): boolean {
  if (priorUserMessages === 0) return !isFollowUpMessage(message);
  if (NEW_IDEA_PATTERN.test(message)) return true;
  return !isFollowUpMessage(message) && message.trim().length >= 40 && IDEA_HINT_PATTERN.test(message);
}

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

  if (agentId === "product-manager") {
    const john = getAgent("product-manager");
    return `Hey! I'm **${john.name}**, ${john.persona}. Point me at the discussion so far and I'll cut an MVP, pick web / mobile / both, and outline a plan to build.

Example: \`/john Turn this thread into an MVP and say if it should be web, mobile, or both.\``;
  }

  if (agentId === "architect") {
    const winston = getAgent("architect");
    return `Hey! I'm **${winston.name}**, ${winston.persona}. I'll turn the product shape into stack, hosting, and a build plan — including whether this should be web, mobile, or both.

Example: \`/winston Propose stack and hosting for the plan John just outlined.\``;
  }

  const level = getAgent("honesty-coach");
  return `Hey! I'm ready when you are. Describe an app idea, business concept, or problem you want to think through — try **/honesty** when you want ${level.name} to check your claims.`;
}
