export interface IdeaThought {
  id: string;
  ideaId: string;
  ideaTitle: string;
  sessionId: string;
  sessionTitle: string;
  role: string;
  excerpt: string;
  createdAt: string;
}

export interface SimilarIdeaNudge {
  ideaId: string;
  title: string;
  sessionId: string;
  score: number;
}

export type BmadAgentId =
  | "honesty-coach"
  | "deep-recon"
  | "forge"
  | "brainstorm"
  | "red-team"
  | "design-thinking"
  | "innovation"
  | "problem-solving"
  | "party-mode";

export interface DepthScore {
  overall: number;
  competitionLevel: "low" | "medium" | "high" | "unknown";
  verdict: string;
  signals: string[];
}

export interface HonestyDimension {
  id: string;
  label: string;
  score: number;
  note: string;
}

export interface HonestyBreakdown {
  dimensions: HonestyDimension[];
  flags: string[];
  summary: string;
}

/** @deprecated Use HonestyBreakdown — no overall score */
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

export interface AgentPerspective {
  agentId: BmadAgentId;
  name: string;
  role: string;
  content: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: BmadAgentId;
  routeReason?: string;
  matchedAgents?: Array<{ id: BmadAgentId; label: string }>;
  honestyBreakdown?: HonestyBreakdown;
  /** @deprecated */
  honestyScore?: HonestyScore;
  ideaId?: string;
  relatedIdeas?: Array<{ id: string; title: string; score: number; reason: string }>;
  depthScore?: DepthScore;
  perspectives?: AgentPerspective[];
  showForgeActions?: boolean;
  sessionTitle?: string;
  ideaTitle?: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  activeAgentId: BmadAgentId;
  activeIdeaId?: string;
  pinned?: boolean;
  pinnedAt?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  preview?: string;
  displayTitle?: string;
}

export interface IdeaGroup {
  id: string;
  label: string;
  ideas: IdeaRecord[];
  connectionReason?: string;
}

export interface IdeaGraphNode {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  status: IdeaRecord["status"];
  /** Cluster id this node belongs to (root idea id of its group). */
  groupId: string;
  /** Stable index of the cluster, used to pick a color. */
  groupIndex: number;
  groupLabel: string;
}

export interface IdeaGraphEdge {
  source: string;
  target: string;
  score: number;
  reason: string;
}

export interface IdeaGraph {
  nodes: IdeaGraphNode[];
  edges: IdeaGraphEdge[];
}

export interface IdeaThreadMessage extends ChatMessage {
  sessionTitle?: string;
}

export interface AgentInfo {
  id: BmadAgentId;
  name: string;
  persona: string;
  description: string;
  skillPath: string;
  color: string;
}
