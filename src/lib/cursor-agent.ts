import { buildSystemPrompt } from "@/lib/bmad/load-skill";
import { casualReply, isCasualMessage } from "@/lib/message-utils";
import type { BmadAgentId, DepthScore } from "@/lib/types";

const CURSOR_TIMEOUT_MS = 45_000;

export interface AgentRunOptions {
  agentId: BmadAgentId;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  relatedIdeas: Array<{ title: string; summary: string; reason: string }>;
  ideaTitle?: string;
  researchBlock?: string;
  depthScore?: DepthScore;
}

export function hasCursorApiKey(): boolean {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

export async function* streamAgentResponse(
  options: AgentRunOptions
): AsyncGenerator<string, void, unknown> {
  if (isCasualMessage(options.message)) {
    yield casualReply(options.agentId);
    return;
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();

  if (!apiKey) {
    yield* streamFallbackResponse(options);
    return;
  }

  try {
    yield* streamWithCursorSdk(options, apiKey);
  } catch (error) {
    console.error("Cursor SDK error:", error);
    yield* streamFallbackResponse(options, error);
  }
}

async function* streamWithCursorSdk(
  options: AgentRunOptions,
  apiKey: string
): AsyncGenerator<string, void, unknown> {
  const { Agent } = await import("@cursor/sdk");
  const systemPrompt = buildSystemPrompt(options.agentId, {
    relatedIdeas: options.relatedIdeas,
    ideaTitle: options.ideaTitle,
    researchBlock: options.researchBlock,
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
  const deadline = Date.now() + CURSOR_TIMEOUT_MS;
  let gotText = false;

  for await (const event of run.stream()) {
    if (Date.now() > deadline) {
      if (!gotText) {
        yield* streamFallbackResponse(
          options,
          new Error("Cursor agent timed out after 45s")
        );
      }
      return;
    }
    const text = extractTextFromEvent(event);
    if (text) {
      gotText = true;
      yield text;
    }
  }

  if (!gotText) {
    yield* streamFallbackResponse(options, new Error("No response from Cursor agent"));
  }
}

function extractTextFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;

  if (e.type === "assistant" && e.message && typeof e.message === "object") {
    const message = e.message as { content?: Array<{ type?: string; text?: string }> };
    const text = message.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (text) return text;
  }

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
  const { agentId, message, relatedIdeas, researchBlock, depthScore } = options;
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
    "honesty-coach": `I'm the **Honesty Coach** — I evaluate how grounded your claims are across six dimensions (evidence, specificity, assumptions, feasibility, market awareness, confidence calibration). No single overall score.

Share a substantive idea and I'll run a full breakdown. Example: "I want to build a SaaS for freelancers. There's no competition and it'll be easy."${relatedNote}${errorNote}`,

    forge: `I'll pressure-test this idea with you.

**First probe:** What specific problem does this solve, and for whom — not "everyone," but one concrete person?

Say **"attack this"** to argue against it, **"defend this"** for the strongest case, or answer the question above.${relatedNote}${errorNote}`,

    brainstorm: `Let's brainstorm on: "${message.slice(0, 80)}..."

**Technique: Reverse brainstorming** — What would make this idea fail spectacularly? List 5 failure modes, then flip each into a design constraint.${relatedNote}${errorNote}`,

    "deep-recon": formatDeepReconResponse(
      message,
      relatedNote,
      errorNote,
      researchBlock,
      depthScore
    ),

    "red-team": `**Adversarial review**

| Lens | Finding |
|------|---------|
| Missing evidence | Claims may lack data or sources — cite one source or customer signal |
| Assumptions | List your top 3 assumptions and how you'd test each |
| Feasibility | Estimate build complexity for an MVP in weeks, not months |

Switch to **Honesty Coach** for a six-dimension grounding breakdown.${relatedNote}${errorNote}`,

    "design-thinking": `**Empathy check:** Describe one real user who would use this. What's their day like *before* your idea exists?${relatedNote}${errorNote}`,

    innovation: `**Innovation lens:** Is this a 10x improvement or a feature parity play? What's the unfair advantage?${relatedNote}${errorNote}`,

    "problem-solving": `**Root cause:** State the problem as a symptom. Now ask "why" five times. What's the actual root?${relatedNote}${errorNote}`,

    "party-mode": `**Panel discussion** (simulated):

- **Forge:** What's the weakest assumption here?
- **Mary (Analyst):** What data would validate this?
- **Victor:** Where's the disruption angle?${relatedNote}${errorNote}`,
  };

  const response = responses[agentId] ?? responses.forge;
  const chunks = response.split(/(?<=\.|!|\?|\n)\s+/);
  for (const chunk of chunks) {
    yield chunk + " ";
    await new Promise((r) => setTimeout(r, 30));
  }
}

function formatDeepReconResponse(
  message: string,
  relatedNote: string,
  errorNote: string,
  researchBlock?: string,
  depthScore?: DepthScore
): string {
  const depthSection = depthScore
    ? `## Idea depth verdict

**Depth score: ${depthScore.overall}/100** · Competition: **${depthScore.competitionLevel}**

${depthScore.verdict}

${depthScore.signals.length ? `Signals: ${depthScore.signals.join("; ")}` : ""}

`
    : "";

  const researchSection = researchBlock
    ? `${researchBlock}\n\n`
    : "_Web research unavailable — check network or add CURSOR_API_KEY for full agent research._\n\n";

  return `# Deep Recon report

${depthSection}${researchSection}## What this means for your idea

Based on live search for: "${message.slice(0, 120)}..."

1. **Does it have depth?** ${depthScore ? (depthScore.overall >= 55 ? "Possibly — but validate with customer interviews." : "Unclear or crowded — narrow the niche.") : "Run again with a more specific problem statement."}
2. **Claim grounding:** Switch to **Honesty Coach** for a six-dimension breakdown of how honest your claims are.
3. **Next step:** Pick one competitor from the results above and explain how you'd be 10x better for one user segment.

${relatedNote}${errorNote}`;
}
