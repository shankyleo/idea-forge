import fs from "fs";
import path from "path";
import { getAgent } from "@/lib/bmad/agents";
import type { BmadAgentId } from "@/lib/types";

const PROJECT_ROOT = process.cwd();

export function loadSkillContent(agentId: BmadAgentId): string {
  const agent = getAgent(agentId);
  const skillPath = path.join(/* turbopackIgnore: true */ PROJECT_ROOT, agent.skillPath);
  if (!fs.existsSync(skillPath)) {
    return `You are ${agent.name}, a ${agent.persona}. ${agent.description}`;
  }
  return fs.readFileSync(skillPath, "utf-8");
}

export function buildSystemPrompt(
  agentId: BmadAgentId,
  context: {
    relatedIdeas: Array<{ title: string; summary: string; reason: string }>;
    honestyScore?: { overall: number; flags: string[]; summary: string };
    ideaTitle?: string;
  }
): string {
  const agent = getAgent(agentId);
  const skill = loadSkillContent(agentId);

  const relatedBlock =
    context.relatedIdeas.length > 0
      ? `\n\n## Related ideas in the user's vault\n${context.relatedIdeas
          .map((i) => `- **${i.title}**: ${i.summary} (${i.reason})`)
          .join("\n")}\n\nWhen relevant, connect the current discussion to these ideas.`
      : "";

  const honestyBlock = context.honestyScore
    ? `\n\n## User message honesty analysis (for your awareness)\nOverall score: ${context.honestyScore.overall}/100\nFlags: ${context.honestyScore.flags.join(", ") || "none"}\n${context.honestyScore.summary}\n\nGently surface weak claims. Do not be preachy.`
    : "";

  const ideaBlock = context.ideaTitle
    ? `\n\n## Active idea\nThe user is working on: "${context.ideaTitle}"`
    : "";

  return `You are operating as the BMAD agent "${agent.name}" (${agent.persona}) inside Idea Forge, a thinking companion app.

Follow the BMAD skill instructions below. Adapt them for chat (not file-based workflows). Keep responses focused and conversational unless the user wants depth.

## App behavior
- Score and challenge vague or overconfident claims
- Link ideas to related ones in the vault when it genuinely helps
- One question at a time when pressure-testing (forge mode)
- End each response with a brief "Honesty note" only if you found material gaps

${ideaBlock}${relatedBlock}${honestyBlock}

---

## BMAD Skill Instructions

${skill}`;
}
