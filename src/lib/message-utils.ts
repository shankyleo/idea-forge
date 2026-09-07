import type { BmadAgentId } from "@/lib/types";

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|hiya|howdy|thanks|thank you|ok|okay|help|start|good morning|good evening)[\s!.?]*$/i;

const IDEA_HINT_PATTERN =
  /\b(app|saas|startup|product|idea|build|create|market|business|platform|tool|service|freelancer|mobile|ai)\b/i;

export function isCasualMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20 && !IDEA_HINT_PATTERN.test(trimmed)) return true;
  if (GREETING_PATTERN.test(trimmed)) return true;
  return false;
}

export function shouldRunWebResearch(agentId: BmadAgentId, message: string): boolean {
  return agentId === "deep-recon" && !isCasualMessage(message);
}

export function casualReply(agentId: BmadAgentId): string {
  if (agentId === "deep-recon") {
    return `Hey! I'm **Deep Recon** — I search the web and score whether your idea has real market depth.

Share something specific, for example:
- "SaaS for freelancers to track invoices"
- "AI app that helps restaurants manage inventory"

I'll run live market research, show competitors, and give you a depth score + honesty check.`;
  }

  return `Hey! I'm ready when you are. Describe an app idea, business concept, or problem you want to think through — I'll score your claims and push back where needed.`;
}
