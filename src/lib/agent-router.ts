import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { isCasualMessage } from "@/lib/message-utils";

export interface RouteResult {
  agentId: BmadAgentId;
  reason: string;
  /** When multiple agents are equally relevant, party-mode orchestrates them */
  matchedAgents: Array<{ id: BmadAgentId; label: string }>;
}

type RouteSignal = {
  id: BmadAgentId;
  label: string;
  weight: number;
  test: (text: string) => boolean;
};

const SIGNALS: RouteSignal[] = [
  {
    id: "honesty-coach",
    label: "grounding claims",
    weight: 3,
    test: (t) =>
      /\b(honest|grounded|evidence|sources|assumption|overconfident|too optimistic|no competition|everyone will|guaranteed|easy money|can't fail)\b/i.test(
        t
      ),
  },
  {
    id: "forge",
    label: "pressure-testing",
    weight: 3,
    test: (t) =>
      /\b(attack|defend|pressure.?test|push back|stress.?test|steel.?man|weak spot|poke holes|challenge this|devil'?s advocate)\b/i.test(
        t
      ),
  },
  {
    id: "brainstorm",
    label: "generating options",
    weight: 3,
    test: (t) =>
      /\b(brainstorm|more ideas|alternatives|what else|creative|techniques|100 ideas|diverge)\b/i.test(
        t
      ),
  },
  {
    id: "red-team",
    label: "finding gaps",
    weight: 2,
    test: (t) =>
      /\b(what'?s missing|blind spot|risk|downside|failure mode|what could go wrong|review this|critique|red team)\b/i.test(
        t
      ),
  },
  {
    id: "design-thinking",
    label: "user empathy",
    weight: 2,
    test: (t) =>
      /\b(user|customer|persona|empathy|who would use|pain point|journey|prototype|human.?centered)\b/i.test(
        t
      ),
  },
  {
    id: "innovation",
    label: "disruption angle",
    weight: 2,
    test: (t) =>
      /\b(disrupt|10x|business model|unfair advantage|moat|category|innovation strategy|blue ocean)\b/i.test(
        t
      ),
  },
  {
    id: "problem-solving",
    label: "root cause",
    weight: 2,
    test: (t) =>
      /\b(root cause|five whys|why does|diagnose|symptom|underlying problem|solve for)\b/i.test(
        t
      ),
  },
  {
    id: "deep-recon",
    label: "market research",
    weight: 2,
    test: (t) =>
      /\b(market|competition|competitor|research|landscape|viability|depth|tam|sam|som|whitespace|trend)\b/i.test(
        t
      ),
  },
  {
    id: "product-manager",
    label: "product plan",
    weight: 3,
    test: (t) =>
      /\b(prd|product (?:brief|plan|requirements)|mvp|roadmap|user stor(?:y|ies)|epics?|form.?factor|web or mobile|mobile or web|plan to build)\b/i.test(
        t
      ),
  },
  {
    id: "architect",
    label: "architecture and hosting",
    weight: 3,
    test: (t) =>
      /\b(architect(?:ure)?|tech stack|hosting|deploy(?:ment)?|infra(?:structure)?|how (?:do|should) we (?:host|deploy))\b/i.test(
        t
      ),
  },
];

const IDEA_PATTERN =
  /\b(app|saas|startup|product|idea|build|create|platform|tool|service|mvp|freelancer|mobile|ai|marketplace)\b/i;

function scoreSignals(text: string): Array<{ id: BmadAgentId; label: string; score: number }> {
  const hits = SIGNALS.filter((s) => s.test(text)).map((s) => ({
    id: s.id,
    label: s.label,
    score: s.weight,
  }));

  if (IDEA_PATTERN.test(text) && text.trim().length >= 25) {
    const hasRecon = hits.some((h) => h.id === "deep-recon");
    if (!hasRecon) {
      hits.push({ id: "deep-recon", label: "new idea research", score: 2 });
    }
    const hasHonesty = hits.some((h) => h.id === "honesty-coach");
    if (
      !hasHonesty &&
      /\b(no competition|easy|simple|just|only need|everyone|guaranteed|quickly)\b/i.test(text)
    ) {
      hits.push({ id: "honesty-coach", label: "bold claims", score: 2 });
    }
  }

  return hits.sort((a, b) => b.score - a.score);
}

function followUpAgent(text: string, lastAgentId?: BmadAgentId): BmadAgentId | null {
  const lower = text.toLowerCase();
  if (/\b(disagree|but |however|what about|push back|not convinced)\b/i.test(lower)) {
    return "forge";
  }
  if (/\b(more detail|go deeper|expand|tell me more)\b/i.test(lower)) {
    return lastAgentId ?? "deep-recon";
  }
  if (/\b(okay|got it|next|what now|so what)\b/i.test(lower) && text.length < 80) {
    return lastAgentId ?? "forge";
  }
  return null;
}

/** True when the user is asking Amelia to write code, not to discuss. */
export function isAppBuildIntent(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (/^\/amelia\b/i.test(trimmed)) return true;
  if (/^get started\b/i.test(trimmed)) return true;
  if (/^build this[.!]?$/i.test(trimmed)) return true;
  if (/^(implement|ship|code) this\b/i.test(trimmed)) return true;
  if (
    /\b(go ahead and (build|implement|ship|fix)|please (build|implement|code|fix)|amelia,? (please )?(build|implement|fix|code))\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/\?/.test(trimmed)) return false;
  if (
    /^(add|fix|change|remove|update|implement|wire up|make)\b/i.test(trimmed) &&
    trimmed.length < 140
  ) {
    return true;
  }
  return false;
}

const APP_TEAM_DISCUSSION: BmadAgentId[] = ["architect", "product-manager", "ux-designer"];

function isAppDiscussionAgent(id?: BmadAgentId): boolean {
  return Boolean(id && (APP_TEAM_DISCUSSION as readonly string[]).includes(id));
}

/** Apps chat: discuss first; Amelia builds only on a clear implement ask. */
export function routeAppMessage(
  message: string,
  options?: { lastAgentId?: BmadAgentId }
): RouteResult {
  const trimmed = message.trim();

  if (isAppBuildIntent(trimmed)) {
    return {
      agentId: "developer",
      reason: "Ready to implement — Amelia will build in the app folder",
      matchedAgents: [{ id: "developer", label: "implementation" }],
    };
  }

  if (isCasualMessage(trimmed)) {
    const agentId = isAppDiscussionAgent(options?.lastAgentId)
      ? options!.lastAgentId!
      : "product-manager";
    return {
      agentId,
      reason: "Casual message — conversational reply",
      matchedAgents: [{ id: agentId, label: "conversation" }],
    };
  }

  if (/\b(sally|ux|ui|layout|screen|wireframe|flow|visual design|interaction|confusing|clunky|ugly)\b/i.test(trimmed)) {
    return {
      agentId: "ux-designer",
      reason: "UX and interface discussion",
      matchedAgents: [{ id: "ux-designer", label: "UX" }],
    };
  }
  if (/\b(winston|architect(?:ure)?|tech stack|hosting|deploy(?:ment)?|infra(?:structure)?)\b/i.test(trimmed)) {
    return {
      agentId: "architect",
      reason: "Architecture discussion",
      matchedAgents: [{ id: "architect", label: "architecture" }],
    };
  }

  return {
    agentId: "product-manager",
    reason: "Feedback and questions — discuss before building",
    matchedAgents: [{ id: "product-manager", label: "product discussion" }],
  };
}

export function routeMessage(
  message: string,
  options?: { lastAgentId?: BmadAgentId; messageCount?: number }
): RouteResult {
  const trimmed = message.trim();

  if (isCasualMessage(trimmed)) {
    return {
      agentId: "forge",
      reason: "Casual message — conversational reply",
      matchedAgents: [{ id: "forge", label: "conversation" }],
    };
  }

  if (/^attack this[.!]?$/i.test(trimmed)) {
    return {
      agentId: "forge",
      reason: `${getAgent("forge").name} attack mode — challenging your idea`,
      matchedAgents: [{ id: "forge", label: "attack mode" }],
    };
  }
  if (/^defend this[.!]?$/i.test(trimmed)) {
    return {
      agentId: "forge",
      reason: `${getAgent("forge").name} defend mode — steel-manning your idea`,
      matchedAgents: [{ id: "forge", label: "defend mode" }],
    };
  }

  const followUp = followUpAgent(trimmed, options?.lastAgentId);
  if (followUp) {
    return {
      agentId: followUp,
      reason: `Continuing the thread — ${followUp === "forge" ? "pressure-testing your response" : "going deeper"}`,
      matchedAgents: [{ id: followUp, label: "thread follow-up" }],
    };
  }

  const hits = scoreSignals(trimmed);
  const top = hits[0];
  const second = hits[1];

  if (!top) {
    if (trimmed.length >= 20) {
      return {
        agentId: "deep-recon",
        reason: "Substantive idea — market research and depth check",
        matchedAgents: [{ id: "deep-recon", label: "default idea analysis" }],
      };
    }
    return {
      agentId: "forge",
      reason: "Open-ended thought — exploratory dialogue",
      matchedAgents: [{ id: "forge", label: "exploration" }],
    };
  }

  const plannerLead = top.id === "product-manager" || top.id === "architect";
  const multiAgent =
    !plannerLead &&
    second &&
    top.score >= 2 &&
    second.score >= 2 &&
    hits.filter((h) => h.score >= 2).length >= 2;

  if (multiAgent) {
    const relevant = hits.filter((h) => h.score >= 2).slice(0, 4);
    return {
      agentId: "party-mode",
      reason: `Multiple angles detected: ${relevant.map((r) => r.label).join(", ")}`,
      matchedAgents: relevant.map((r) => ({ id: r.id, label: r.label })),
    };
  }

  return {
    agentId: top.id,
    reason: `Matched for ${top.label}`,
    matchedAgents: hits.slice(0, 3).map((h) => ({ id: h.id, label: h.label })),
  };
}
