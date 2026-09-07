import type { BmadAgentId, DepthScore, AgentPerspective, HonestyBreakdown } from "@/lib/types";
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
  honesty?: HonestyBreakdown;
}): AgentPerspective[] {
  const { message, depthScore, recon, honesty } = input;
  const competition = depthScore?.competitionLevel ?? recon?.depth.competitionLevel ?? "unknown";
  const score = depthScore?.overall ?? recon?.depth.depthScore ?? 50;
  const topCompetitors = (recon?.findings ?? []).slice(0, 3).map((f) => f.title);

  const topic = toTopic(message);
  const rival = topCompetitors[0] ?? "the incumbents";
  const second = topCompetitors[1];

  // Use the honesty breakdown to make each take specific to *this* input.
  const dims = honesty?.dimensions ?? [];
  const weakest = [...dims].sort((a, b) => a.score - b.score)[0];
  const topFlag = honesty?.flags?.[0];

  const forge = getAgent("forge");
  const reviewer = getAgent("red-team");
  const victor = getAgent("innovation");
  const maya = getAgent("design-thinking");

  const forgeContent = [
    score < 45
      ? `**"${topic}"** looks crowded or still fuzzy (${score}/100 depth).`
      : competition === "high"
        ? `**"${topic}"** has real signal but a crowded field (${score}/100). Your risk isn't "no market" — it's **me-too positioning**.`
        : `**"${topic}"** has room to run (${score}/100) — so I want a kill test before you commit.`,
    topFlag
      ? `The claim I'd attack first: *${topFlag}*`
      : `Name **one real person** who tried to solve this in the last 30 days — not a hypothetical.`,
    `**What single piece of evidence would make you abandon this in 30 days?**`,
  ].join(" ");

  const reviewerContent = [
    weakest
      ? `Your weakest link is **${weakest.label.toLowerCase()}** (${weakest.score}/100): ${weakest.note}`
      : `Biggest gap is a thin evidence base — few concrete signals.`,
    topCompetitors.length > 0
      ? `Also spell out how you differ from ${[rival, second].filter(Boolean).join(" and ")}.`
      : `And confirm what people use *instead* today before designing features.`,
    `Close **one** of these this week with a single customer conversation.`,
  ].join(" ");

  const victorContent =
    competition === "high"
      ? `Don't fight ${rival} head-on. Find a **10x wedge** for **"${topic}"** — a narrow vertical, an AI-native workflow, or a bundle incumbents can't ship this quarter. What can only *you* do here?`
      : `There's space to define the category around **"${topic}"** — but move before someone else owns the story. What's the unfair advantage (distribution, data, or insight) that others can't copy?`;

  const mayaContent = [
    `Picture the one person who needs **"${topic}"** most, in the moment right before your product exists.`,
    `What are they doing *instead* today, and what's the specific frustration in that scene?`,
    `If you can't describe it in two sentences, the target user isn't concrete enough yet.`,
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
