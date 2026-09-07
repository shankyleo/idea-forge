import type { BmadAgentId, DepthScore, AgentPerspective } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import type { DeepReconResult } from "@/lib/web-research";

export type { AgentPerspective };

export function generatePerspectives(input: {
  message: string;
  depthScore?: DepthScore;
  recon?: Pick<DeepReconResult, "findings" | "depth">;
  primaryAgentId?: BmadAgentId;
}): AgentPerspective[] {
  const { message, depthScore, recon } = input;
  const competition = depthScore?.competitionLevel ?? recon?.depth.competitionLevel ?? "unknown";
  const score = depthScore?.overall ?? recon?.depth.depthScore ?? 50;
  const topCompetitors = (recon?.findings ?? []).slice(0, 3).map((f) => f.title);

  const forge = getAgent("forge");
  const reviewer = getAgent("red-team");
  const victor = getAgent("innovation");
  const maya = getAgent("design-thinking");

  const forgeContent =
    score < 45
      ? `This idea reads crowded or vague. Before building, name **one freelancer** who paid for invoice tools last month — not hypothetically. What's the wedge vs ${topCompetitors[0] ?? "incumbents"}?`
      : competition === "high"
        ? `Market signal is real but crowded (${score}/100 depth). Your risk isn't "no market" — it's **me-too positioning**. What do you know that ${topCompetitors[0] ?? "existing players"} got wrong for a specific niche?`
        : `Promising space, but I'm not letting "${message.slice(0, 60)}..." slide without a kill test: **what would make you abandon this in 30 days?**`;

  const reviewerContent =
    topCompetitors.length > 0
      ? `Missing from your pitch: (1) why switch now, (2) pricing vs ${topCompetitors.slice(0, 2).join(" / ") || "alternatives"}, (3) one customer interview quote or data point. Pick one gap and close it this week.`
      : `Thin evidence base — few competitors surfaced, which could mean whitespace **or** a fuzzy problem statement. Run 5 customer calls before feature design.`;

  const victorContent =
    competition === "high"
      ? `Don't compete head-on. Find a **10x wedge**: AI-native workflow, vertical niche (e.g. creative freelancers only), or bundling invoices with something incumbents can't ship in a quarter.`
      : `Room to define the category — but move fast before a no-code template shop owns the narrative. What's the unfair advantage only you have?`;

  const mayaContent = `Picture one freelancer at 11pm on tax day. What are they doing **right before** your app exists? If you can't describe that scene in two sentences, the idea isn't concrete enough yet.`;

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
