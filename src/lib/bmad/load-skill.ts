import fs from "fs";
import path from "path";
import { getAgent } from "@/lib/bmad/agents";
import { RESPONSE_FORMAT_INSTRUCTION } from "@/lib/panel-perspectives";
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

  const isPlanner = agentId === "product-manager" || agentId === "architect";
  const planBehavior =
    agentId === "product-manager"
      ? `- You are John. Skip menus, file writes, and uv scripts. In chat, produce an MVP cut, decide web / mobile / both, and a phased plan to build from this conversation.`
      : agentId === "architect"
        ? `- You are Winston. Skip menus, file writes, and uv scripts. In chat, produce stack, platform (web / mobile / both), build approach, and hosting/deploy.`
        : "";
  const formatBlock = isPlanner
    ? `

## Required response format (Idea Forge UI)

1. **### At a glance** — 2–3 sentences.
2. **### Plan** — ${
        agentId === "product-manager"
          ? "MVP cut, web / mobile / both, and phased build steps."
          : "stack, platform (web / mobile / both), and hosting/deploy."
      }
3. Do not write files, run scripts, or present a numbered menu. Ask at most one closing question.
`
    : RESPONSE_FORMAT_INSTRUCTION;

  return `You are operating as the BMAD agent "${agent.name}" (${agent.persona}) inside Idea Forge, a thinking companion app.

Follow the BMAD skill instructions below. Adapt them for chat (not file-based workflows). Keep responses focused and conversational unless the user wants depth.

## App behavior
- Link ideas to related ones in the vault when it genuinely helps
- One question at a time when pressure-testing (forge mode)
- For ${getAgent("deep-recon").name}: include a **Depth verdict** section with competition level and go/no-go guidance
- Honesty scoring is handled by ${getAgent("honesty-coach").name} only — do not invent honesty scores
${planBehavior}

${ideaBlock}${relatedBlock}${researchBlock}${formatBlock}

---

## BMAD Skill Instructions

${skill}`;
}
