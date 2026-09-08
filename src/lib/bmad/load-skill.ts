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
    workspace?: "ideas" | "app";
    localPath?: string;
    githubRepo?: string;
  }
): string {
  const agent = getAgent(agentId);
  const skill = loadSkillContent(agentId);
  const appWorkspace = context.workspace === "app";

  const relatedBlock =
    !appWorkspace && context.relatedIdeas.length > 0
      ? `\n\n## Related ideas in the user's vault\n${context.relatedIdeas
          .map((i) => `- **${i.title}**: ${i.summary} (${i.reason})`)
          .join("\n")}\n\nWhen relevant, connect the current discussion to these ideas.`
      : "";

  const ideaBlock = context.ideaTitle
    ? `\n\n## Active ${appWorkspace ? "app" : "idea"}\nThe user is working on: "${context.ideaTitle}"`
    : "";

  const researchBlock = context.researchBlock
    ? `\n\n## Pre-run web research (use as evidence — cite sources)\n${context.researchBlock}\n\nSynthesize these findings. Give a depth verdict: does this idea have real market depth or is it crowded/vague?`
    : "";

  const folderBlock =
    appWorkspace && context.localPath
      ? `\n\n## App folder (your working directory)\n${context.localPath}${
          context.githubRepo ? `\nGitHub: https://github.com/${context.githubRepo}` : "\nGitHub: not set yet."
        }\nRead START.md, SPEC.md, ARCHITECTURE.md, and BUILD.md in this folder. Implement in this folder — do not write the product into the Idea Forge repo unless this folder *is* that repo.`
      : "";

  const isPlanner = agentId === "product-manager" || agentId === "architect";
  const planBehavior = appWorkspace
    ? agentId === "developer"
      ? `- You are Amelia. Skip BMAD menus, uv scripts, and numbered skill checklists. Write and edit real source files in the app folder. Follow the charter. Summarize what you changed. When the app can run, start it yourself (install if needed, then the dev server). Wait until it is up before sharing a URL. Never tell the user to run npm run dev. Never use port 43123 — that is Idea Forge.`
      : agentId === "architect"
        ? `- You are Winston. Skip menus, uv scripts, and Promote to an app — this is already an app. Architecture lives here; update ARCHITECTURE.md in the folder when the stack changes.`
        : agentId === "product-manager"
          ? `- You are John. Skip menus and uv scripts. Refine MVP/scope in chat; update SPEC.md in the app folder when the cut changes.`
          : agentId === "ux-designer"
            ? `- You are Sally. Skip menus and uv scripts. Design screens and flows; you may add DESIGN.md or UX notes in the app folder.`
            : ""
    : agentId === "product-manager"
      ? `- You are John. Skip menus, file writes, and uv scripts. In chat, produce an MVP cut, decide web / mobile / both, and a phased plan to build from this conversation.`
      : agentId === "architect"
        ? `- You are Winston. Skip menus, file writes, and uv scripts. In chat, produce stack, platform (web / mobile / both), build approach, and hosting/deploy. When the plan is enough to start, mention **Promote to an app** — that form collects a local folder (GitHub is optional and can wait), then writes the charter.`
        : "";

  const formatBlock = appWorkspace
    ? agentId === "developer"
      ? `

## Required response format (Apps chat)

Do the work in the app folder. After file changes, start the app yourself if it can run. Summarize what you wrote. Do not present a numbered BMAD menu. Never tell the user to run npm run dev. Ask at most one closing question.
`
      : `

## Required response format (Apps chat)

1. **### At a glance** — 2–3 sentences.
2. **### Plan** or design notes as needed.
3. You may update markdown in the app folder. Do not present a numbered BMAD menu. Ask at most one closing question.
`
    : isPlanner
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

  const behaviorIntro = appWorkspace
    ? `You are operating as the BMAD agent "${agent.name}" (${agent.persona}) inside Idea Forge Apps — a dedicated chat for building this product.

Follow the BMAD skill instructions below, but adapt them for this app folder. Skip BMAD menus, uv, and file-based workflow gates.

## App behavior
${planBehavior}`
    : `You are operating as the BMAD agent "${agent.name}" (${agent.persona}) inside Idea Forge, a thinking companion app.

Follow the BMAD skill instructions below. Adapt them for chat (not file-based workflows). Keep responses focused and conversational unless the user wants depth.

## App behavior
- Link ideas to related ones in the vault when it genuinely helps
- One question at a time when pressure-testing (forge mode)
- For ${getAgent("deep-recon").name}: include a **Depth verdict** section with competition level and go/no-go guidance
- Honesty scoring is handled by ${getAgent("honesty-coach").name} only — do not invent honesty scores
${planBehavior}`;

  return `${behaviorIntro}

${ideaBlock}${folderBlock}${relatedBlock}${researchBlock}${formatBlock}

---

## BMAD Skill Instructions

${skill}`;
}
