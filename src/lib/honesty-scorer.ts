import type { HonestyBreakdown, HonestyDimension } from "@/lib/types";

export interface HonestyScoreContext {
  competitionLevel?: "low" | "medium" | "high" | "unknown";
  depthScore?: number;
  hasResearch?: boolean;
}

const OVERCONFIDENCE = [
  "definitely",
  "guaranteed",
  "guarantee",
  "no-brainer",
  "obviously",
  "obvious",
  "clearly",
  "everyone",
  "everybody",
  "no one else",
  "nobody else",
  "will be huge",
  "will be massive",
  "can't fail",
  "cannot fail",
  "sure thing",
  "easy money",
  "millions",
  "billion",
  "revolutionary",
  "game-changer",
  "game changer",
  "disrupt everything",
];

const ABSOLUTES = [
  "no competition",
  "no competitors",
  "first to market",
  "nobody is doing",
  "no one is doing",
  "never been done",
  "always",
  "never",
  "everyone will",
  "all users",
  "any user",
  "100%",
  "zero risk",
];

const HEDGES = [
  "might",
  "maybe",
  "could",
  "i think",
  "i believe",
  "probably",
  "i assume",
  "assumption",
  "hypothesis",
  "we'd need to test",
  "need to validate",
  "not sure",
  "unclear",
  "it depends",
  "one segment",
];

const UNDERESTIMATION = [
  "easy",
  "simple",
  "just ",
  "simply",
  "quick",
  "quickly",
  "in a weekend",
  "in a week",
  "trivial",
  "piece of cake",
  "straightforward",
  "all i need",
  "only need",
];

const FEASIBILITY_AWARE = [
  "hard",
  "difficult",
  "challenge",
  "challenging",
  "risk",
  "constraint",
  "bottleneck",
  "logistics",
  "regulation",
  "compliance",
  "unit economics",
  "margin",
  "churn",
  "retention",
  "cac",
  "ltv",
];

const MARKET_AWARE = [
  "competitor",
  "competition",
  "alternative",
  "incumbent",
  "existing",
  "market",
  "vs ",
  "versus",
  "compared to",
  "differentiat",
  "positioning",
  "segment",
  "niche",
  "tam",
  "sam",
  "som",
];

const VAGUE = [
  "everyone",
  "people",
  "users",
  "stuff",
  "things",
  "someone",
  "some people",
  "a lot of",
  "many",
  "better",
  "good",
  "nice",
];

const SPECIFIC_SIGNALS = [
  "specifically",
  "for example",
  "such as",
  "e.g.",
  "target",
  "persona",
  "who ",
  "when ",
  "because",
];

function countHits(haystack: string, needles: string[]): { count: number; matched: string[] } {
  const matched: string[] = [];
  for (const n of needles) {
    if (haystack.includes(n)) matched.push(n.trim());
  }
  return { count: matched.length, matched };
}

function clamp(n: number): number {
  return Math.max(4, Math.min(96, Math.round(n)));
}

/**
 * Dynamic, rule-based honesty breakdown derived entirely from the user's input
 * (and optional research context). Produces per-input dimension scores, notes,
 * and flags so the score adapts to what the user actually wrote — no API key
 * required.
 */
export function scoreHonesty(message: string, ctx: HonestyScoreContext = {}): HonestyBreakdown {
  const text = ` ${message.toLowerCase().replace(/\s+/g, " ")} `;
  const words = message.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const flags: string[] = [];

  const numbers = (message.match(/\b\d[\d,.]*\s?(%|percent|k|m|bn|billion|million|users|customers|\$|usd|mo|month|year)?/gi) || [])
    .filter((m) => /\d/.test(m));
  const hasSources = /(https?:\/\/|according to|study|survey|report|data (shows|from)|research (shows|by))/i.test(message);
  const examples = countHits(text, ["for example", "such as", "e.g.", "for instance", "like when"]);

  const overconf = countHits(text, OVERCONFIDENCE);
  const absolutes = countHits(text, ABSOLUTES);
  const hedges = countHits(text, HEDGES);
  const underestimation = countHits(text, UNDERESTIMATION);
  const feasAware = countHits(text, FEASIBILITY_AWARE);
  const marketAware = countHits(text, MARKET_AWARE);
  const vague = countHits(text, VAGUE);
  const specific = countHits(text, SPECIFIC_SIGNALS);

  // Evidence & sources
  let evidence = 30 + numbers.length * 12 + (hasSources ? 25 : 0) + examples.count * 10;
  if (numbers.length === 0 && !hasSources) {
    evidence -= 8;
    flags.push("No numbers, sources, or concrete examples to back the claims.");
  }
  const evidenceNote =
    numbers.length + (hasSources ? 1 : 0) + examples.count > 0
      ? `Found ${numbers.length} figure(s)${hasSources ? ", a source reference" : ""}${examples.count ? ", and an example" : ""}. Cite where they come from.`
      : "Nothing quantified yet — add one real number, source, or example.";

  // Specificity
  const lengthScore = wordCount >= 45 ? 30 : wordCount >= 22 ? 22 : wordCount >= 12 ? 14 : 6;
  const specificity = 34 + lengthScore + specific.count * 8 - vague.count * 7;
  if (vague.count >= 2) {
    flags.push(`Vague language ("${vague.matched.slice(0, 2).join('", "')}") — name the exact user and job.`);
  }
  const specificityNote =
    specific.count > 0 || wordCount >= 30
      ? "Reasonably concrete — keep naming the exact user, context, and moment."
      : "Too broad — who exactly is this for, and in what specific situation?";

  // Assumptions stated
  let assumptions = 52 + hedges.count * 10 - absolutes.count * 16 - overconf.count * 6;
  if (absolutes.count > 0) {
    assumptions -= 6;
    flags.push(`Untested absolute: "${absolutes.matched[0]}". Treat it as a hypothesis to check.`);
  }
  const assumptionsNote =
    hedges.count > absolutes.count + overconf.count
      ? "You frame claims as testable — good. List the top 3 and how you'd validate each."
      : "Claims read as settled facts. Mark your biggest assumptions and how to test them.";

  // Feasibility realism
  let feasibility = 50 + feasAware.count * 10 - underestimation.count * 12;
  if (underestimation.count > 0) {
    feasibility -= 4;
    flags.push(`"${underestimation.matched[0].trim()}" underestimates the build — scope the hard parts.`);
  }
  const feasibilityNote =
    feasAware.count > 0
      ? "You acknowledge real constraints — quantify the hardest one (cost, ops, or retention)."
      : "No hard parts named yet. What's genuinely difficult about shipping and keeping this alive?";

  // Market awareness
  const compBoost =
    ctx.competitionLevel === "high" ? 8 : ctx.competitionLevel === "medium" ? 4 : 0;
  let market = 34 + marketAware.count * 9 + compBoost + (ctx.hasResearch ? 6 : 0);
  const claimsNoComp = /\bno (competition|competitors)\b|first to market|nobody is doing|no one is doing/i.test(message);
  if (claimsNoComp) {
    market -= 26;
    if (ctx.competitionLevel === "high" || ctx.competitionLevel === "medium") {
      flags.push('You claim little/no competition, but research surfaced existing players.');
    } else {
      flags.push('"No competition" usually means the market is unproven or not yet found.');
    }
  }
  const marketNote = claimsNoComp
    ? "Assuming an empty field is risky — map at least 3 alternatives (including status quo)."
    : marketAware.count > 0
      ? "You reference the landscape — sharpen how you differ from the top alternative."
      : "No competitors or alternatives named. Who/what do users use today instead?";

  // Confidence calibration
  const hype = overconf.count + absolutes.count;
  const calibration = 60 + hedges.count * 8 - hype * 13;
  if (hype >= 2) {
    flags.push(`Overconfident tone (${hype} strong claims) outruns the evidence provided.`);
  }
  const calibrationNote =
    hype > hedges.count
      ? "Confidence is running ahead of proof — match each strong claim with evidence or a hedge."
      : "Calibrated tone — you're claiming about as much as you've shown.";

  const dimensions: HonestyDimension[] = [
    { id: "evidence", label: "Evidence & sources", score: clamp(evidence), note: evidenceNote },
    { id: "specificity", label: "Specificity", score: clamp(specificity), note: specificityNote },
    { id: "assumptions", label: "Assumptions stated", score: clamp(assumptions), note: assumptionsNote },
    { id: "feasibility", label: "Feasibility realism", score: clamp(feasibility), note: feasibilityNote },
    { id: "market-awareness", label: "Market awareness", score: clamp(market), note: marketNote },
    { id: "calibration", label: "Confidence calibration", score: clamp(calibration), note: calibrationNote },
  ];

  const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  const strongest = [...dimensions].sort((a, b) => b.score - a.score)[0];
  const summary =
    weakest.score < 45
      ? `Weakest link is **${weakest.label.toLowerCase()}** (${weakest.score}) — strongest is ${strongest.label.toLowerCase()} (${strongest.score}). Close the gap before building.`
      : `Fairly grounded overall — strongest on ${strongest.label.toLowerCase()} (${strongest.score}), keep an eye on ${weakest.label.toLowerCase()} (${weakest.score}).`;

  return { dimensions, flags: flags.slice(0, 4), summary };
}
