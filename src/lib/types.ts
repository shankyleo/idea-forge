export type BmadAgentId =
  | "forge"
  | "brainstorm"
  | "research"
  | "red-team"
  | "design-thinking"
  | "innovation"
  | "problem-solving"
  | "party-mode";

export interface HonestyScore {
  overall: number;
  evidence: number;
  specificity: number;
  assumptions: number;
  feasibility: number;
  flags: string[];
  summary: string;
}

export interface IdeaRecord {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  status: "draft" | "forging" | "validated" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface IdeaLink {
  ideaId: string;
  relatedId: string;
  score: number;
  reason: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: BmadAgentId;
  honestyScore?: HonestyScore;
  ideaId?: string;
  relatedIdeas?: Array<{ id: string; title: string; score: number; reason: string }>;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  activeAgentId: BmadAgentId;
  activeIdeaId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInfo {
  id: BmadAgentId;
  name: string;
  persona: string;
  description: string;
  skillPath: string;
  color: string;
}
