import type { AgentPerspective, BmadAgentId, DepthScore } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { runAgentOnce, hasCursorApiKey } from "@/lib/cursor-agent";
import { generatePerspectives } from "@/lib/panel-perspectives";
import type { DeepReconResult } from "@/lib/web-research";

const PANEL_AGENTS: Array<{ id: BmadAgentId; role: string }> = [
  { id: "forge", role: "Critique · pressure-test" },
  { id: "red-team", role: "Gaps & risks" },
  { id: "innovation", role: "Disruption angle" },
  { id: "design-thinking", role: "User reality check" },
];

const PANEL_TIMEOUT_MS = 28_000;

function buildPanelPrompt(input: {
  agentId: BmadAgentId;
  message: string;
  researchBlock?: string;
  crossChatContext?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const agent = getAgent(input.agentId);
  const historyBlock =
    input.history && input.history.length > 0
      ? `\nConversation so far:\n${input.history
          .slice(-6)
          .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
          .join("\n")}\n`
      : "";

  return `You are ${agent.name}, ${agent.persona}, on an idea review panel inside Idea Forge.

The founder just shared:
"""
${input.message}
"""
${historyBlock}${input.crossChatContext ? `\n${input.crossChatContext}\n` : ""}${input.researchBlock ? `\nMarket research:\n${input.researchBlock.slice(0, 2500)}\n` : ""}

Your job: give YOUR perspective in 2–4 sentences as ${agent.name}. Take a clear stance — this idea has legs, needs a pivot, or should be killed — and say why from your lens. Share concrete reasoning. Advise the team; do NOT ask the user questions. No markdown headers.`;
}

export async function runPanelPerspectives(input: {
  message: string;
  researchBlock?: string;
  crossChatContext?: string;
  depthScore?: DepthScore;
  recon?: Pick<DeepReconResult, "findings" | "depth">;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AgentPerspective[]> {
  if (!hasCursorApiKey()) {
    return generatePerspectives({
      message: input.message,
      depthScore: input.depthScore,
      recon: input.recon,
    });
  }

  const results = await Promise.all(
    PANEL_AGENTS.map(async ({ id, role }) => {
      const agent = getAgent(id);
      try {
        const content = await runAgentOnce({
          agentId: id,
          message: input.message,
          promptOverride: buildPanelPrompt({ agentId: id, ...input }),
          history: input.history ?? [],
          relatedIdeas: [],
          researchBlock: input.researchBlock,
          depthScore: input.depthScore,
        }, PANEL_TIMEOUT_MS);

        const trimmed = content.trim().slice(0, 600);
        if (!trimmed) throw new Error("empty panel response");

        return {
          agentId: id,
          name: agent.name,
          role,
          content: trimmed,
          color: agent.color,
        } satisfies AgentPerspective;
      } catch {
        const [fallback] = generatePerspectives({
          message: input.message,
          depthScore: input.depthScore,
          recon: input.recon,
        }).filter((p) => p.agentId === id);
        return fallback ?? {
          agentId: id,
          name: agent.name,
          role,
          content: `${agent.name} couldn't weigh in this turn.`,
          color: agent.color,
        };
      }
    })
  );

  return results;
}
