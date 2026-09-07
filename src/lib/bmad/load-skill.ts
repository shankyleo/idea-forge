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
    ideaTitle?: string;
    researchBlock?: string;
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

  const ideaBlock = context.ideaTitle
    ? `\n\n## Active idea\nThe user is working on: "${context.ideaTitle}"`
    : "";

  const researchBlock = context.researchBlock
    ? `\n\n## Pre-run web research (use as evidence — cite sources)\n${context.researchBlock}\n\nSynthesize these findings. Give a depth verdict: does this idea have real market depth or is it crowded/vague?`
    : "";

  return `You are operating as the BMAD agent "${agent.name}" (${agent.persona}) inside Idea Forge, a thinking companion app.

Follow the BMAD skill instructions below. Adapt them for chat (not file-based workflows). Keep responses focused and conversational unless the user wants depth.

## App behavior
- Link ideas to related ones in the vault when it genuinely helps
- One question at a time when pressure-testing (forge mode)
- For Deep Recon: include a **Depth verdict** section with competition level and go/no-go guidance
- Honesty scoring is handled by the Honesty Coach agent only — do not invent honesty scores

${ideaBlock}${relatedBlock}${researchBlock}

---

## BMAD Skill Instructions

${skill}`;
}
