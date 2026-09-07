import type { HonestyScore } from "@/lib/types";

const ABSOLUTE_WORDS = [
  "always",
  "never",
  "everyone",
  "nobody",
  "guaranteed",
  "impossible",
  "definitely",
  "certainly",
  "obviously",
  "undoubtedly",
  "without doubt",
  "no one",
  "all users",
  "every user",
];

const HEDGING_WORDS = [
  "maybe",
  "perhaps",
  "might",
  "could",
  "possibly",
  "i think",
  "i believe",
  "not sure",
  "unsure",
  "hypothesis",
];

const MARKET_CLAIMS = [
  "market size",
  "tam",
  "billion",
  "million users",
  "no competition",
  "first ever",
  "revolutionary",
  "disrupt",
  "10x",
  "viral",
];

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreHonesty(text: string): HonestyScore {
  const lower = text.toLowerCase();
  const flags: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let evidence = 70;
  let specificity = 60;
  let assumptions = 70;
  let feasibility = 65;

  const hasNumbers = /\d/.test(text);
  const hasSources = /source|study|data|research|according to|survey|report/i.test(text);
  const hasExamples = /for example|such as|like when|case study/i.test(text);

  if (hasNumbers) evidence += 10;
  if (hasSources) evidence += 15;
  if (hasExamples) evidence += 8;
  if (!hasNumbers && MARKET_CLAIMS.some((w) => lower.includes(w))) {
    evidence -= 20;
    flags.push("Market claim without numbers");
  }

  const absoluteHits = ABSOLUTE_WORDS.filter((w) => lower.includes(w));
  if (absoluteHits.length > 0) {
    assumptions -= absoluteHits.length * 8;
    flags.push(`Absolute language: ${absoluteHits.slice(0, 3).join(", ")}`);
  }

  const hedgeHits = HEDGING_WORDS.filter((w) => lower.includes(w));
  if (hedgeHits.length >= 2) {
    assumptions += 10;
  }

  if (wordCount >= 40) specificity += 15;
  else if (wordCount < 12) {
    specificity -= 20;
    flags.push("Very short — lacks detail");
  }

  if (/\b(it|this|that|they|thing|stuff)\b/i.test(text) && wordCount < 30) {
    specificity -= 10;
    flags.push("Vague referents (it/this/that)");
  }

  if (/easy|simple|just|only takes|quickly|overnight/i.test(lower)) {
    feasibility -= 15;
    flags.push("Underestimates complexity");
  }

  if (/validated|proven|tested|customers already|paying users/i.test(lower) && !hasNumbers) {
    assumptions -= 12;
    flags.push("Validation claim without evidence");
  }

  if (/no risk|can't fail|sure thing|free money/i.test(lower)) {
    feasibility -= 25;
    assumptions -= 20;
    flags.push("Overconfident / ignores risk");
  }

  const scores = {
    evidence: clamp(evidence),
    specificity: clamp(specificity),
    assumptions: clamp(assumptions),
    feasibility: clamp(feasibility),
  };

  const overall = clamp(
    scores.evidence * 0.3 +
      scores.specificity * 0.2 +
      scores.assumptions * 0.25 +
      scores.feasibility * 0.25
  );

  let summary: string;
  if (overall >= 80) {
    summary = "Grounded and specific. Claims appear measured.";
  } else if (overall >= 60) {
    summary = "Reasonable starting point. Some claims could use evidence or nuance.";
  } else if (overall >= 40) {
    summary = "Several unexamined assumptions. Worth pressure-testing before acting.";
  } else {
    summary = "High overconfidence or vagueness. Treat as hypothesis, not fact.";
  }

  return { overall, ...scores, flags, summary };
}

export function honestyColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function honestyBg(score: number): string {
  if (score >= 75) return "bg-emerald-500/15 border-emerald-500/30";
  if (score >= 50) return "bg-amber-500/15 border-amber-500/30";
  return "bg-rose-500/15 border-rose-500/30";
}
