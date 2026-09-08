import { buildSystemPrompt } from "@/lib/bmad/load-skill";
import { casualReply, isCasualMessage } from "@/lib/message-utils";
import {
  buildForgeModeReply,
  buildStructuredDeepReconNarrative,
} from "@/lib/panel-perspectives";
import type { DeepReconResult } from "@/lib/web-research";
import { getAgent } from "@/lib/bmad/agents";
import type { BmadAgentId, DepthScore } from "@/lib/types";

const CURSOR_TIMEOUT_MS = 180_000;
const HISTORY_MAX_MESSAGES = 8;
const HISTORY_MAX_CHARS = 1_800;

function compactHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
): Array<{ role: "user" | "assistant"; content: string }> {
  return history.slice(-HISTORY_MAX_MESSAGES).map((m) => ({
    role: m.role,
    content:
      m.content.length > HISTORY_MAX_CHARS
        ? `${m.content.slice(0, HISTORY_MAX_CHARS)}\n…[truncated]`
        : m.content,
  }));
}

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
  /** Working directory for Cursor tools (app folder in Apps chat). */
  workspaceCwd?: string;
  workspace?: "ideas" | "app";
  localPath?: string;
  githubRepo?: string;
  onStatus?: (message: string) => void;
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
    workspace: options.workspace,
    localPath: options.localPath,
    githubRepo: options.githubRepo,
  });

  const crossBlock = options.crossChatContext
    ? `\n\n## Context from other chats\n${options.crossChatContext}`
    : "";

  const historyBlock =
    options.history.length > 0
      ? `\n\n## Conversation so far\n${compactHistory(options.history)
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n\n")}`
      : "";

  const prompt =
    options.promptOverride ??
    `${systemPrompt}${crossBlock}${historyBlock}\n\nUSER: ${options.message}\n\nRespond as the active BMAD agent. Be concise.`;

  const agent = await Agent.create({
    apiKey,
    model: { id: "composer-2.5" },
    local: { cwd: options.workspaceCwd ?? process.cwd() },
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
    workspace: options.workspace,
    localPath: options.localPath,
    githubRepo: options.githubRepo,
  });

  const historyBlock =
    options.history.length > 0
      ? `\n\n## Conversation so far\n${compactHistory(options.history)
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n\n")}`
      : "";

  const agent = await Agent.create({
    apiKey,
    model: { id: "composer-2.5" },
    local: { cwd: options.workspaceCwd ?? process.cwd() },
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

  const prompt = `${systemPrompt}${crossBlock}${historyBlock}\n\nUSER: ${options.message}${forgePrefix}\n\nRespond as the active BMAD agent.${
    options.workspace === "app"
      ? " Work in the app folder. Write and edit files there when the task needs code."
      : " Use the required response format."
  }`;

  const run = await agent.send(prompt);
  let idleDeadline = Date.now() + CURSOR_TIMEOUT_MS;
  let gotText = false;
  const agentName = getAgent(options.agentId).name;
  options.onStatus?.(`${agentName} is working…`);

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
    const activity = statusFromSdkEvent(event, agentName);
    if (activity) options.onStatus?.(activity);
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

function toolStatusLabel(name: string, agentName: string): string {
  const n = name.toLowerCase();
  if (n.includes("shell") || n.includes("bash") || n === "exec") {
    return `${agentName} is running a command…`;
  }
  if (n.includes("write") || n.includes("edit") || n.includes("strreplace") || n.includes("apply")) {
    return `${agentName} is writing files…`;
  }
  if (n.includes("read") || n.includes("grep") || n.includes("glob") || n.includes("search")) {
    return `${agentName} is reading the project…`;
  }
  if (n.includes("npm") || n.includes("install")) {
    return `${agentName} is installing dependencies…`;
  }
  return `${agentName} is working…`;
}

function statusFromSdkEvent(event: unknown, agentName: string): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;
  if (e.type === "tool_call") {
    const name = typeof e.name === "string" ? e.name : "tool";
    if (e.status === "completed" || e.status === "error") return `${agentName} is working…`;
    return toolStatusLabel(name, agentName);
  }
  if (e.type === "thinking") return `${agentName} is thinking…`;
  if (e.type === "assistant" && e.message && typeof e.message === "object") {
    const content =
      (e.message as { content?: Array<{ type?: string; name?: string }> }).content ?? [];
    const tool = content.find((block) => block.type === "tool_use");
    if (tool?.name) return toolStatusLabel(tool.name, agentName);
  }
  if (e.type === "status" && e.status === "RUNNING") return `${agentName} is working…`;
  return null;
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

    "product-manager": `### At a glance\n\nMVP first: one job, one user, one surface.\n\n### Plan\n- **MVP:** the smallest loop that proves the idea.\n- **Platform:** web unless the job is on-the-go; add mobile only if capture or notifications are core.\n- **Build:** (1) core loop (2) accounts (3) share or export.\n\nAdd CURSOR_API_KEY for a plan from *this* thread.${relatedNote}${errorNote}`,

    architect: `### At a glance\n\nShip a web app first; wrap native later if the web flow fails on device features.\n\n### Plan\n- **Stack:** one web app, one data store, one file/blob store.\n- **Host:** app host + managed DB + object storage.\n- **Mobile:** PWA first, native only if camera/offline require it.\n\nAdd CURSOR_API_KEY for a plan from *this* thread.${relatedNote}${errorNote}`,

    "ux-designer": `### At a glance\n\nName one job and one screen. I'll sketch the flow, empty states, and what not to build yet.\n\nAdd CURSOR_API_KEY for UX from *this* thread.${relatedNote}${errorNote}`,

    developer: `### At a glance\n\nI'll implement in the app folder: read START.md / SPEC.md / ARCHITECTURE.md / BUILD.md, then write the MVP there.\n\nAdd CURSOR_API_KEY so I can actually edit those files.${relatedNote}${errorNote}`,

    "party-mode": `### At a glance\n\n**${getAgent("forge").name}:** Weakest assumption?\n**${getAgent("deep-recon").name}:** What data validates this?\n**${getAgent("innovation").name}:** Disruption angle?${relatedNote}${errorNote}`,
  };

  const response = responses[agentId] ?? responses.forge;
  yield response;
}
