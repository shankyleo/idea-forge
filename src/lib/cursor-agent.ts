import { buildSystemPrompt } from "@/lib/bmad/load-skill";
import type { BmadAgentId, HonestyScore } from "@/lib/types";

export interface AgentRunOptions {
  agentId: BmadAgentId;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  relatedIdeas: Array<{ title: string; summary: string; reason: string }>;
  honestyScore: HonestyScore;
  ideaTitle?: string;
}

export function hasCursorApiKey(): boolean {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

export async function* streamAgentResponse(
  options: AgentRunOptions
): AsyncGenerator<string, void, unknown> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();

  if (!apiKey) {
    yield* streamFallbackResponse(options);
    return;
  }

  try {
    const { Agent } = await import("@cursor/sdk");
    const systemPrompt = buildSystemPrompt(options.agentId, {
      relatedIdeas: options.relatedIdeas,
      honestyScore: options.honestyScore,
      ideaTitle: options.ideaTitle,
    });

    const historyBlock =
      options.history.length > 0
        ? `\n\n## Conversation so far\n${options.history
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n\n")}`
        : "";

    const agent = await Agent.create({
      apiKey,
      model: { id: "composer-2.5" },
      local: { cwd: process.cwd() },
    });

    const prompt = `${systemPrompt}${historyBlock}\n\nUSER: ${options.message}\n\nRespond as the active BMAD agent. Be concise unless depth is needed.`;

    const run = await agent.send(prompt);

    for await (const event of run.stream()) {
      const text = extractTextFromEvent(event);
      if (text) yield text;
    }
  } catch (error) {
    console.error("Cursor SDK error:", error);
    yield* streamFallbackResponse(options, error);
  }
}

function extractTextFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;

  if (e.type === "assistant" && typeof e.text === "string") return e.text;
  if (e.type === "text-delta" && typeof e.delta === "string") return e.delta;
  if (e.type === "content_block_delta") {
    const delta = e.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  if (typeof e.content === "string") return e.content;

  return null;
}

async function* streamFallbackResponse(
  options: AgentRunOptions,
  error?: unknown
): AsyncGenerator<string, void, unknown> {
  const { agentId, message, honestyScore, relatedIdeas } = options;
  const errorNote = error
    ? `\n\n*(Cursor API unavailable — running in local guidance mode. Set \`CURSOR_API_KEY\` for full BMAD agent responses.)*`
    : `\n\n*(Demo mode — add \`CURSOR_API_KEY\` from [Cursor Dashboard → API Keys](https://cursor.com/dashboard/api) for live BMAD agents.)*`;

  const relatedNote =
    relatedIdeas.length > 0
      ? `\n\n**Related ideas in your vault:**\n${relatedIdeas
          .map((r) => `- ${r.title}: ${r.reason}`)
          .join("\n")}`
      : "";

  const responses: Record<BmadAgentId, string> = {
    forge: `I'll pressure-test this idea with you.

**First probe:** What specific problem does this solve, and for whom — not "everyone," but one concrete person?

Your honesty score is **${honestyScore.overall}/100**. ${honestyScore.summary}${honestyScore.flags.length ? `\n\nFlags: ${honestyScore.flags.join("; ")}` : ""}

Say **"attack this"** to argue against it, **"defend this"** for the strongest case, or answer the question above.${relatedNote}${errorNote}`,

    brainstorm: `Let's brainstorm on: "${message.slice(0, 80)}..."

**Technique: Reverse brainstorming** — What would make this idea fail spectacularly? List 5 failure modes, then flip each into a design constraint.

Honesty: **${honestyScore.overall}/100** — ${honestyScore.summary}${relatedNote}${errorNote}`,

    research: `Research framing for your claim:

1. What decision does this research need to support?
2. What would falsify your hypothesis?
3. Who are 3 existing players, and how are they different?

Honesty: **${honestyScore.overall}/100**. ${honestyScore.flags.length ? `Watch: ${honestyScore.flags.join("; ")}` : "Reasonable starting point."}${relatedNote}${errorNote}`,

    "red-team": `**Adversarial review**

| Lens | Finding |
|------|---------|
| Missing evidence | ${honestyScore.evidence < 60 ? "Claims lack data or sources" : "Some grounding present"} |
| Assumptions | ${honestyScore.assumptions < 60 ? "Untested assumptions detected" : "Assumptions mostly explicit"} |
| Feasibility | ${honestyScore.feasibility < 60 ? "Complexity may be underestimated" : "Feasibility seems considered"} |

**Overall honesty: ${honestyScore.overall}/100** — ${honestyScore.summary}${relatedNote}${errorNote}`,

    "design-thinking": `**Empathy check:** Describe one real user who would use this. What's their day like *before* your idea exists?

Honesty score: **${honestyScore.overall}/100**. ${honestyScore.summary}${relatedNote}${errorNote}`,

    innovation: `**Innovation lens:** Is this a 10x improvement or a feature parity play? What's the unfair advantage?

Honesty: **${honestyScore.overall}/100**${relatedNote}${errorNote}`,

    "problem-solving": `**Root cause:** State the problem as a symptom. Now ask "why" five times. What's the actual root?

Honesty: **${honestyScore.overall}/100** — ${honestyScore.summary}${relatedNote}${errorNote}`,

    "party-mode": `**Panel discussion** (simulated):

- **Forge:** What's the weakest assumption here?
- **Mary (Analyst):** What data would validate this?
- **Victor:** Where's the disruption angle?

Honesty score: **${honestyScore.overall}/100**${relatedNote}${errorNote}`,
  };

  const response = responses[agentId] ?? responses.forge;
  const chunks = response.split(/(?<=\.|!|\?|\n)\s+/);
  for (const chunk of chunks) {
    yield chunk + " ";
    await new Promise((r) => setTimeout(r, 30));
  }
}
