import type { AgentInfo, BmadAgentId } from "@/lib/types";

export const BMAD_AGENTS: AgentInfo[] = [
  {
    id: "honesty-coach",
    name: "Honesty Coach",
    persona: "Claim grounding analyst",
    description:
      "BMAD agent that scores your idea across six dimensions — no overall number, full breakdown.",
    skillPath: ".agents/skills/bmad-honesty-coach/SKILL.md",
    color: "#14b8a6",
  },
  {
    id: "deep-recon",
    name: "Deep Recon",
    persona: "Research director",
    description:
      "Live market & online research. Checks if your idea has real depth, competition, and whitespace.",
    skillPath: ".agents/skills/bmad-deep-recon/SKILL.md",
    color: "#3b82f6",
  },
  {
    id: "forge",
    name: "Forge",
    persona: "Adversarial interrogator",
    description: "Pressure-test ideas until they harden or break. Attack and defend modes.",
    skillPath: ".agents/skills/bmad-forge-idea/SKILL.md",
    color: "#f97316",
  },
  {
    id: "brainstorm",
    name: "Carson",
    persona: "Brainstorming coach",
    description: "Generate 100+ ideas using proven creative techniques.",
    skillPath: ".agents/skills/bmad-brainstorming/SKILL.md",
    color: "#eab308",
  },
  {
    id: "red-team",
    name: "Reviewer",
    persona: "Adversarial reviewer",
    description: "Find what's missing, not just what's wrong. Stress-test assumptions.",
    skillPath: ".agents/skills/bmad-review/SKILL.md",
    color: "#ef4444",
  },
  {
    id: "design-thinking",
    name: "Maya",
    persona: "Design thinking coach",
    description: "Human-centered design through empathy, ideation, and prototyping.",
    skillPath: ".agents/skills/bmad-cis-design-thinking/SKILL.md",
    color: "#a855f7",
  },
  {
    id: "innovation",
    name: "Victor",
    persona: "Innovation strategist",
    description: "Find disruption opportunities and business model innovation.",
    skillPath: ".agents/skills/bmad-cis-innovation-strategy/SKILL.md",
    color: "#06b6d4",
  },
  {
    id: "problem-solving",
    name: "Dr. Quinn",
    persona: "Problem solver",
    description: "Systematic diagnosis and root cause analysis.",
    skillPath: ".agents/skills/bmad-cis-problem-solving/SKILL.md",
    color: "#10b981",
  },
  {
    id: "party-mode",
    name: "Party Mode",
    persona: "Multi-agent panel",
    description: "Orchestrate BMAD agents in one conversation for diverse perspectives.",
    skillPath: ".agents/skills/bmad-party-mode/SKILL.md",
    color: "#ec4899",
  },
];

export function getAgent(id: BmadAgentId): AgentInfo {
  const agent = BMAD_AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown agent: ${id}`);
  return agent;
}
