export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface DepthAssessment {
  depthScore: number;
  competitionLevel: "low" | "medium" | "high" | "unknown";
  verdict: string;
  signals: string[];
}

export interface DeepReconResult {
  queries: string[];
  findings: SearchResult[];
  depth: DepthAssessment;
  researchBlock: string;
}

function extractSearchQueries(idea: string): string[] {
  const cleaned = idea.replace(/\s+/g, " ").trim().slice(0, 300);
  const base = cleaned.split(/[.!?]/)[0]?.trim() ?? cleaned;

  return [
    `${base} market competitors 2025 2026`,
    `${base} startup existing products`,
    `${base} market size problem validation`,
  ].slice(0, 3);
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; IdeaForge/1.0; +https://github.com/bmad-code-org)",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) return [];
    const html = await res.text();
    return parseDuckDuckGoHtml(html).slice(0, 5);
  } catch {
    return [];
  }
}

function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const resultRegex =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
    const url = decodeURIComponent(match[1].replace(/.*uddg=/, "").split("&")[0] ?? match[1]);
    const title = stripTags(match[2]).trim();
    const snippet = stripTags(match[3]).trim();
    if (title && snippet) {
      results.push({ title, snippet, url });
    }
  }

  if (results.length === 0) {
    const fallbackRegex =
      /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/gi;
    while ((match = fallbackRegex.exec(html)) !== null && results.length < 5) {
      const url = match[1];
      const title = stripTags(match[2]).trim();
      if (title) results.push({ title, snippet: "", url });
    }
  }

  return results;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

function assessDepth(findings: SearchResult[], idea: string): DepthAssessment {
  const text = `${idea} ${findings.map((f) => `${f.title} ${f.snippet}`).join(" ")}`.toLowerCase();
  const signals: string[] = [];

  const competitorWords = [
    "competitor",
    "alternative",
    "vs",
    "compare",
    "similar",
    "incumbent",
    "leader",
    "platform",
    "saas",
    "app",
  ];
  const saturationWords = [
    "crowded",
    "saturated",
    "many options",
    "established",
    "market leader",
    "dominant",
  ];
  const opportunityWords = [
    "gap",
    "underserved",
    "unmet",
    "niche",
    "emerging",
    "growing market",
    "no solution",
    "fragmented",
  ];

  const competitorHits = competitorWords.filter((w) => text.includes(w)).length;
  const saturationHits = saturationWords.filter((w) => text.includes(w)).length;
  const opportunityHits = opportunityWords.filter((w) => text.includes(w)).length;

  let competitionLevel: DepthAssessment["competitionLevel"] = "unknown";
  let depthScore = 50;

  if (findings.length >= 4 && competitorHits >= 2) {
    competitionLevel = "high";
    depthScore -= 15;
    signals.push("Multiple existing players found in search results");
  } else if (findings.length >= 2) {
    competitionLevel = "medium";
    signals.push("Some existing solutions detected — differentiation matters");
  } else if (findings.length <= 1) {
    competitionLevel = "low";
    depthScore += 10;
    signals.push("Few direct matches — could be whitespace or need sharper positioning");
  }

  if (saturationHits > 0) {
    depthScore -= 10;
    signals.push("Market saturation language in sources");
  }

  if (opportunityHits > 0) {
    depthScore += 12;
    signals.push("Opportunity/gap language in sources");
  }

  if (findings.length === 0) {
    competitionLevel = "unknown";
    depthScore = 45;
    signals.push("Limited online signal — idea may be too vague or too novel to assess");
  }

  depthScore = Math.max(0, Math.min(100, depthScore));

  let verdict: string;
  if (depthScore >= 70) {
    verdict = "Promising depth — real problem space with room to differentiate.";
  } else if (depthScore >= 50) {
    verdict = "Moderate depth — viable but needs a clear wedge against incumbents.";
  } else if (depthScore >= 35) {
    verdict = "Shallow or crowded — validate a specific niche before committing.";
  } else {
    verdict = "Weak signal — refine the problem statement or run deeper research.";
  }

  return { depthScore, competitionLevel, verdict, signals };
}

export async function runDeepRecon(idea: string): Promise<DeepReconResult> {
  const queries = extractSearchQueries(idea);
  const allFindings: SearchResult[] = [];
  const seen = new Set<string>();

  const searchResults = await Promise.all(
    queries.map((q) => searchDuckDuckGo(q))
  );

  for (const results of searchResults) {
    for (const r of results) {
      const key = r.url || r.title;
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(r);
      }
    }
  }

  const depth = assessDepth(allFindings, idea);

  const researchBlock = [
    "## Live web research (this run)",
    "",
    `Queries: ${queries.map((q) => `"${q}"`).join(", ")}`,
    "",
    allFindings.length > 0
      ? allFindings
          .slice(0, 8)
          .map(
            (f, i) =>
              `${i + 1}. **${f.title}**\n   ${f.snippet || "(no snippet)"}\n   Source: ${f.url}`
          )
          .join("\n\n")
      : "No web results retrieved — network may be restricted. Ask user to retry or add CURSOR_API_KEY for full agent research.",
    "",
    "## Depth assessment",
    `- **Depth score:** ${depth.depthScore}/100`,
    `- **Competition:** ${depth.competitionLevel}`,
    `- **Verdict:** ${depth.verdict}`,
    depth.signals.length ? `- **Signals:** ${depth.signals.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { queries, findings: allFindings, depth, researchBlock };
}
