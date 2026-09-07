import type { BmadAgentId, DepthScore, AgentPerspective } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import type { DeepReconResult } from "@/lib/web-research";

export type { AgentPerspective };

function toTopic(message: string): string {
  let t = message.trim().replace(/\s+/g, " ");
  t = t.replace(/^(i\s+(?:really\s+)?(?:want|would like|wanna|plan|hope|need|aim)\s+to\s+)/i, "");
  t = t.replace(/^(i'?m\s+(?:thinking about|considering|exploring|building)\s+)/i, "");
  t = t.replace(/^(what if\s+(?:i|we)\s+(?:could\s+)?)/i, "");
  t = t.replace(/^(let'?s\s+)/i, "");
  t = t.replace(/^(my\s+)?idea\s+is\s+(?:to\s+|for\s+)?/i, "");
  t = t.replace(/^(build|create|make|design|develop|launch|start)\s+/i, "");
  t = t.replace(/^(an?|the|my)\s+/i, "");
  t = t.trim().replace(/[.!?]+$/, "");
  if (!t) t = message.trim();
  if (t.length > 90) t = t.slice(0, 90).replace(/\s+\S*$/, "") + "…";
  return t;
}

export function generatePerspectives(input: {
  message: string;
  depthScore?: DepthScore;
  recon?: Pick<DeepReconResult, "findings" | "depth">;
  primaryAgentId?: BmadAgentId;
}): AgentPerspective[] {
  const { message, depthScore, recon } = input;
  const competition = depthScore?.competitionLevel ?? recon?.depth.competitionLevel ?? "unknown";
  const score = depthScore?.overall ?? recon?.depth.depthScore;
  const topCompetitors = (recon?.findings ?? []).slice(0, 3).map((f) => f.title);

  const topic = toTopic(message);
  const rival = topCompetitors[0] ?? "the incumbents";
  const second = topCompetitors[1];

  const boldClaim =
    message.match(
      /\b(definitely|guaranteed|no competition|everyone will|can't fail|obviously|100%|revolutionary)\b/i
    )?.[0] ?? null;

  const forge = getAgent("forge");
  const reviewer = getAgent("red-team");
  const victor = getAgent("innovation");
  const maya = getAgent("design-thinking");

  const depthLine =
    score != null
      ? score < 45
        ? `**"${topic}"** looks crowded or still fuzzy (${score}/100 depth).`
        : competition === "high"
          ? `**"${topic}"** has real signal but a crowded field (${score}/100). Your risk isn't "no market" — it's **me-too positioning**.`
          : `**"${topic}"** has room to run (${score}/100) — so I want a kill test before you commit.`
      : `**"${topic}"** needs sharper framing before I'd bet on it — what's the one sentence a skeptical user would believe?`;

  const forgeContent = [
    depthLine,
    boldClaim
      ? `I'd push back on *"${boldClaim}"* — that's assertion without proof. Either find a signal or narrow the claim.`
      : `The idea is directionally interesting but still unproven — I'd want one real user story before committing.`,
    score != null && score >= 55
      ? `**Verdict:** worth a focused experiment, not a full build yet.`
      : `**Verdict:** refine or kill unless you can name a wedge in 48 hours.`,
  ].join(" ");

  const reviewerContent = [
    topCompetitors.length > 0
      ? `The gap I see: no clear differentiation from ${[rival, second].filter(Boolean).join(" and ")} yet.`
      : `The gap I see: thin evidence — no named users, no alternatives mapped, no validation signal.`,
    message.length < 80
      ? `The framing is too thin to evaluate — add user, pain, and what exists today.`
      : `Competition and substitutes aren't spelled out enough to trust the positioning.`,
    `**Verdict:** ${topCompetitors.length > 0 ? "pivot the wedge, don't broaden scope." : "validate before building."}`,
  ].join(" ");

  const victorContent =
    competition === "high"
      ? `Fighting ${rival} head-on loses. The play is a **10x wedge** for **"${topic}"** — narrow vertical, AI-native workflow, or bundle incumbents can't ship soon.`
      : `There's whitespace to **own a category narrative** around **"${topic}"** — move before a template shop copies the story.`;

  const mayaContent = [
    `The user scene isn't concrete yet for **"${topic}"**.`,
    `I don't see the *moment of frustration* — what's the user doing right before your product, and why do they switch?`,
    `**Verdict:** ${message.length >= 80 ? "promising pain, needs a sharper persona." : "too vague to trust the target user."}`,
  ].join(" ");

  return [
    { agentId: forge.id, name: forge.name, role: "Critique · always challenges", content: forgeContent, color: forge.color },
    { agentId: reviewer.id, name: reviewer.name, role: "Gaps & risks", content: reviewerContent, color: reviewer.color },
    { agentId: victor.id, name: victor.name, role: "Disruption angle", content: victorContent, color: victor.color },
    { agentId: maya.id, name: maya.name, role: "User reality check", content: mayaContent, color: maya.color },
  ];
}

export function buildStructuredDeepReconNarrative(input: {
  message: string;
  recon: DeepReconResult;
}): string {
  const { message, recon } = input;
  const { depth, findings } = recon;

  const competitorLines =
    findings.length > 0
      ? findings
          .slice(0, 5)
          .map((f) => `- **${f.title}** — ${f.snippet.slice(0, 120)}${f.snippet.length > 120 ? "…" : ""}`)
          .join("\n")
      : "- No strong web matches — sharpen the problem statement or retry research.";

  return `### At a glance

**Depth ${depth.depthScore}/100** · Competition **${depth.competitionLevel}** — ${depth.verdict}

---

### Market snapshot

| | |
|---|---|
| **Your idea** | ${message.slice(0, 140)}${message.length > 140 ? "…" : ""} |
| **Depth score** | ${depth.depthScore}/100 |
| **Competition** | ${depth.competitionLevel} |
| **Verdict** | ${depth.verdict} |

**Key signals:** ${depth.signals.join(" · ") || "Limited data"}

---

### Competitors & alternatives (top ${Math.min(findings.length, 5)})

${competitorLines}

---

### What to do next

1. Pick **one** competitor and write how you'd be 10× better for **one** user segment.
2. Use **Attack this** if you want Forge to tear the idea apart — or **Defend this** to steel-man it.
3. Run **Honesty Coach** if you want claim-by-claim grounding.`;
}

export function buildForgeModeReply(mode: "attack" | "defend", lastUserMessage: string): string {
  const topic = lastUserMessage.slice(0, 200);

  if (mode === "attack") {
    return `### Forge — Attack mode

I'm **not** agreeing with this until you've answered:

1. **Who pays on day 1?** Not "freelancers" — name the segment and why they switch *now*.
2. **Why isn't ${topic.includes("invoice") ? "FreshBooks / Wave / Stripe Invoicing" : "an incumbent or spreadsheet"} enough?**
3. **What's the kill signal?** What evidence in 30 days would make you stop?

Your move: pick **one** assumption above and defend it with evidence — or revise the idea.`;
  }

  return `### Forge — Defend mode

Strongest version of your idea:

> ${topic.slice(0, 120)}…

**Steel-man:** The pain is real for solo operators who outgrow spreadsheets but hate enterprise accounting. A mobile-first, invoice-status tracker with payment nudges could win a niche if you own one vertical (e.g. designers, consultants).

**Still required:** One customer quote, one competitor gap, one metric for week-1 success.

Switch to **Attack this** when you want me hostile again.`;
}

export const RESPONSE_FORMAT_INSTRUCTION = `

## Required response format (Idea Forge UI)

Structure every substantive reply in clean markdown:

1. **### At a glance** — 2–3 sentences max.
2. **### Main analysis** — your primary lens. Use bullets or short tables. Never dump raw search results; synthesize max 5 competitors.
3. Do NOT repeat the panel sections — the app renders Forge, Reviewer, Victor, and Maya perspectives separately.

Keep paragraphs short. Use tables for scores/metrics. End the main analysis with one sharp question.
`;
