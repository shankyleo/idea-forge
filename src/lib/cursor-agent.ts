import { buildSystemPrompt } from "@/lib/bmad/load-skill";
import { casualReply, isCasualMessage } from "@/lib/message-utils";
import {
  buildForgeModeReply,
  buildStructuredDeepReconNarrative,
} from "@/lib/panel-perspectives";
import type { DeepReconResult } from "@/lib/web-research";
import { getAgent } from "@/lib/bmad/agents";
import type { BmadAgentId, DepthScore } from "@/lib/types";

const CURSOR_TIMEOUT_MS = 120_000;

export interface AgentRunOptions {
  agentId: BmadAgentId;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  relatedIdeas: Array<{ title: string; summary: string; reason: string }>;
  ideaTitle?: string;
  researchBlock?: string;
  depthScore?: DepthScore;
  recon?: DeepReconResult;
  forgeMode?: "attack" | "defend";
  topicMessage?: string;
  /** When set, sent as the full user prompt (skips default USER wrapper). */
  promptOverride?: string;
  crossChatContext?: string;
}

export function hasCursorApiKey(): boolean {
  return Boolean(process.env.CURSOR_API_KEY?.trim());
}

/** Collect a single non-streaming agent response (for panel perspectives). */
export async function runAgentOnce(
  options: AgentRunOptions,
  timeoutMs = 30_000
): Promise<string> {
  if (isCasualMessage(options.message) && !options.promptOverride) {
    return casualReply(options.agentId);
  }

  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    let fallback = "";
    for await (const chunk of streamFallbackResponse(options)) {
      fallback += chunk;
    }
    return fallback.trim();
  }

  const { Agent } = await import("@cursor/sdk");
  const systemPrompt = buildSystemPrompt(options.agentId, {
    relatedIdeas: options.relatedIdeas,
    ideaTitle: options.ideaTitle,
    researchBlock: options.researchBlock,
  });

  const crossBlock = options.crossChatContext
    ? `\n\n## Context from other chats\n${options.crossChatContext}`
    : "";

  const historyBlock =
    options.history.length > 0
      ? `\n\n## Conversation so far\n${options.history
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n\n")}`
      : "";

  const prompt =
    options.promptOverride ??
    `${systemPrompt}${crossBlock}${historyBlock}\n\nUSER: ${options.message}\n\nRespond as the active BMAD agent. Be concise.`;

  const agent = await Agent.create({
    apiKey,
    model: { id: "composer-2.5" },
    local: { cwd: process.cwd() },
  });

  const run = await agent.send(prompt);
  const deadline = Date.now() + timeoutMs;
  let full = "";

  for await (const event of run.stream()) {
    if (Date.now() > deadline) break;
    const text = extractTextFromEvent(event);
    if (text) full += text;
  }

  return full.trim();
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

  const forgePrefix =
    options.forgeMode === "attack"
      ? "\n\nUSER invoked **attack this**. Argue against the idea. Find contradictions and failure modes. Do not agree."
      : options.forgeMode === "defend"
        ? "\n\nUSER invoked **defend this**. Steel-man the strongest version of the idea."
        : "";

  const crossBlock = options.crossChatContext
    ? `\n\n## Context from other chats\n${options.crossChatContext}`
    : "";

  const prompt = `${systemPrompt}${crossBlock}${historyBlock}\n\nUSER: ${options.message}${forgePrefix}\n\nRespond as the active BMAD agent. Use the required response format.`;

  const run = await agent.send(prompt);
  let idleDeadline = Date.now() + CURSOR_TIMEOUT_MS;
  let gotText = false;

  for await (const event of run.stream()) {
    if (Date.now() > idleDeadline) {
      if (!gotText) {
        yield* streamFallbackResponse(
          options,
          new Error("Cursor agent timed out after 120s of inactivity")
        );
      }
      return;
    }
    idleDeadline = Date.now() + CURSOR_TIMEOUT_MS;
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
  const { agentId, message, relatedIdeas, depthScore, recon, forgeMode, topicMessage } = options;
  const topic = topicMessage ?? message;
  const errorNote = error
    ? `\n\n*(Cursor API unavailable — set \`CURSOR_API_KEY\` in \`.env.local\`.)*`
    : "";

  const relatedNote =
    relatedIdeas.length > 0
      ? `\n\n**Related ideas in your vault:**\n${relatedIdeas.map((r) => `- ${r.title}: ${r.reason}`).join("\n")}`
      : "";

  if (agentId === "forge" && forgeMode) {
    const response = buildForgeModeReply(forgeMode, topic) + relatedNote + errorNote;
    yield response;
    return;
  }

  if (agentId === "deep-recon" && recon) {
    const response =
      buildStructuredDeepReconNarrative({ message, recon }) + relatedNote + errorNote;
    yield response;
    return;
  }

  const responses: Record<BmadAgentId, string> = {
    "honesty-coach": `### At a glance\n\nShare a substantive idea for a six-dimension honesty breakdown (no overall score).${relatedNote}${errorNote}`,

    forge: `### At a glance\n\nI'll pressure-test this with you — one question at a time.\n\n**First probe:** What specific problem does this solve, and for whom — not "everyone," but one concrete person?\n\nUse **Attack this** or **Defend this** below.${relatedNote}${errorNote}`,

    brainstorm: `### At a glance\n\nReverse brainstorming on: "${message.slice(0, 80)}…"\n\n**List 5 ways this fails** — then flip each into a design constraint.${relatedNote}${errorNote}`,

    "deep-recon": `### At a glance\n\nWeb research did not complete. Retry with a sharper problem statement or check network.${relatedNote}${errorNote}`,

    "red-team": `### At a glance\n\n| Gap | Finding |\n|-----|--------|\n| Evidence | Cite one customer signal or source |\n| Assumptions | Name top 3 and how to test each |\n| Feasibility | MVP scope in weeks, not months |${relatedNote}${errorNote}`,

    "design-thinking": `### At a glance\n\nDescribe **one real user** before your app exists. What's their day like?${relatedNote}${errorNote}`,

    innovation: `### At a glance\n\n10× improvement or parity play? What's the unfair advantage?${relatedNote}${errorNote}`,

    "problem-solving": `### At a glance\n\nState the problem as a symptom, then ask "why" five times.${relatedNote}${errorNote}`,

    "party-mode": `### At a glance\n\n**${getAgent("forge").name}:** Weakest assumption?\n**${getAgent("deep-recon").name}:** What data validates this?\n**${getAgent("innovation").name}:** Disruption angle?${relatedNote}${errorNote}`,
  };

  const response = responses[agentId] ?? responses.forge;
  yield response;
}
