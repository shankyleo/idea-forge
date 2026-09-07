import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  BmadAgentId,
  ChatMessage,
  ChatSession,
  DepthScore,
  HonestyBreakdown,
  IdeaLink,
  IdeaRecord,
} from "@/lib/types";
import { slugify } from "@/lib/utils";
import { buildIdeaGroups } from "@/lib/idea-groups";
import {
  isGenericSessionTitle,
  normalizeConversationTitle,
  resolveSessionDisplayTitle,
} from "@/lib/session-titles";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "idea-forge.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idea_links (
      idea_id TEXT NOT NULL,
      related_id TEXT NOT NULL,
      score REAL NOT NULL,
      reason TEXT NOT NULL,
      PRIMARY KEY (idea_id, related_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_agent_id TEXT NOT NULL,
      active_idea_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_id TEXT,
      honesty_score TEXT,
      idea_id TEXT,
      related_ideas TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_ideas_updated ON ideas(updated_at DESC);
  `);

  try {
    database.exec(`ALTER TABLE messages ADD COLUMN honesty_breakdown TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN depth_score TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN route_reason TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN matched_agents TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN perspectives TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE messages ADD COLUMN show_forge_actions INTEGER DEFAULT 0`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE ideas ADD COLUMN honesty_snapshot TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN pinned_at TEXT`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE ideas ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // column already exists
  }
  try {
    database.exec(`ALTER TABLE ideas ADD COLUMN pinned_at TEXT`);
  } catch {
    // column already exists
  }
}

function rowToIdea(row: Record<string, unknown>): IdeaRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    summary: row.summary as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    status: row.status as IdeaRecord["status"],
    pinned: Boolean(row.pinned),
    pinnedAt: (row.pinned_at as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listIdeas(): IdeaRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM ideas
       ORDER BY pinned DESC, COALESCE(pinned_at, updated_at) DESC, updated_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToIdea);
}

export function updateIdeaPin(id: string, pinned: boolean): IdeaRecord | null {
  const idea = getIdea(id);
  if (!idea) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE ideas SET pinned = ?, pinned_at = ?, updated_at = ? WHERE id = ?`)
    .run(pinned ? 1 : 0, pinned ? now : null, now, id);
  return getIdea(id);
}

function legacyHonestyToBreakdown(legacy: {
  evidence: number;
  specificity: number;
  assumptions: number;
  feasibility: number;
  flags: string[];
  summary: string;
}): HonestyBreakdown {
  return {
    dimensions: [
      { id: "evidence", label: "Evidence & sources", score: legacy.evidence, note: "" },
      { id: "specificity", label: "Specificity", score: legacy.specificity, note: "" },
      { id: "assumptions", label: "Assumptions stated", score: legacy.assumptions, note: "" },
      { id: "feasibility", label: "Feasibility realism", score: legacy.feasibility, note: "" },
    ],
    flags: legacy.flags,
    summary: legacy.summary,
  };
}

export function getIdea(id: string): IdeaRecord | null {
  const row = getDb().prepare("SELECT * FROM ideas WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToIdea(row) : null;
}

export function upsertIdea(input: {
  id?: string;
  title: string;
  summary?: string;
  tags?: string[];
  status?: IdeaRecord["status"];
}): IdeaRecord {
  const now = new Date().toISOString();
  const id = input.id ?? uuidv4();
  const existing = getIdea(id);

  if (existing) {
    getDb()
      .prepare(
        `UPDATE ideas SET title = ?, summary = ?, tags = ?, status = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        input.title,
        input.summary ?? existing.summary,
        JSON.stringify(input.tags ?? existing.tags),
        input.status ?? existing.status,
        now,
        id
      );
  } else {
    getDb()
      .prepare(
        `INSERT INTO ideas (id, title, summary, tags, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.title,
        input.summary ?? "",
        JSON.stringify(input.tags ?? []),
        input.status ?? "draft",
        now,
        now
      );
  }

  return getIdea(id)!;
}

export function extractAndSaveIdea(content: string, sessionId: string): IdeaRecord | null {
  const trimmed = content.trim();
  if (trimmed.length < 20) return null;

  const ideaPatterns = [
    /(?:idea|app|product|startup|build|create|what if)[:\s]+(.{15,120})/i,
    /(?:i want to|thinking about|considering)[:\s]+(.{15,120})/i,
  ];

  let title = "";
  for (const pattern of ideaPatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      title = match[1].replace(/[.!?]+$/, "").trim();
      break;
    }
  }

  if (!title) {
    const firstSentence = trimmed.split(/[.!?]/)[0]?.trim() ?? trimmed;
    if (firstSentence.length < 15) return null;
    title = firstSentence.slice(0, 100);
  }

  title = normalizeConversationTitle(title, 80);

  const slug = slugify(title);
  const existing = listIdeas().find(
    (i) => slugify(i.title) === slug || i.title.toLowerCase() === title.toLowerCase()
  );
  if (existing) return existing;

  return upsertIdea({
    title,
    summary: trimmed.slice(0, 300),
    tags: extractTags(trimmed),
    status: "draft",
  });
}

function extractTags(text: string): string[] {
  const keywords = [
    "saas",
    "mobile",
    "ai",
    "marketplace",
    "productivity",
    "health",
    "finance",
    "education",
    "social",
    "developer",
    "b2b",
    "b2c",
  ];
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k));
}

export function saveIdeaLink(link: IdeaLink) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO idea_links (idea_id, related_id, score, reason)
       VALUES (?, ?, ?, ?)`
    )
    .run(link.ideaId, link.relatedId, link.score, link.reason);
}

export function getAllIdeaLinks(): IdeaLink[] {
  const rows = getDb()
    .prepare("SELECT * FROM idea_links ORDER BY score DESC")
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    ideaId: r.idea_id as string,
    relatedId: r.related_id as string,
    score: r.score as number,
    reason: r.reason as string,
  }));
}

export function getRelatedIdeasForIdea(ideaId: string): Array<IdeaRecord & { linkReason: string; score: number }> {
  const links = getIdeaLinks(ideaId);
  const reverse = getDb()
    .prepare("SELECT * FROM idea_links WHERE related_id = ? ORDER BY score DESC")
    .all(ideaId) as Record<string, unknown>[];

  const seen = new Set<string>();
  const results: Array<IdeaRecord & { linkReason: string; score: number }> = [];

  for (const link of links) {
    if (seen.has(link.relatedId)) continue;
    const idea = getIdea(link.relatedId);
    if (idea) {
      seen.add(link.relatedId);
      results.push({ ...idea, linkReason: link.reason, score: link.score });
    }
  }
  for (const row of reverse) {
    const otherId = row.idea_id as string;
    if (seen.has(otherId)) continue;
    const idea = getIdea(otherId);
    if (idea) {
      seen.add(otherId);
      results.push({
        ...idea,
        linkReason: row.reason as string,
        score: row.score as number,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function getSessionMessageCount(sessionId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as c FROM messages WHERE session_id = ?")
    .get(sessionId) as { c: number };
  return row.c;
}

export function getSessionPreview(sessionId: string): string {
  const row = getDb()
    .prepare(
      `SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1`
    )
    .get(sessionId) as { content: string } | undefined;
  return row?.content?.slice(0, 80) ?? "";
}

export function getSessionFirstUserMessage(sessionId: string): string {
  const row = getDb()
    .prepare(
      `SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`
    )
    .get(sessionId) as { content: string } | undefined;
  return row?.content ?? "";
}

export function getSessionDisplayTitle(session: ChatSession): string {
  const idea = session.activeIdeaId ? getIdea(session.activeIdeaId) : null;
  const firstUserMessage = getSessionFirstUserMessage(session.id);
  return resolveSessionDisplayTitle({
    sessionTitle: session.title,
    ideaTitle: idea?.title,
    firstUserMessage: firstUserMessage || undefined,
  });
}

export function listSessionsWithMeta(): ChatSession[] {
  return listSessions().map((session) => ({
    ...session,
    messageCount: getSessionMessageCount(session.id),
    preview: getSessionPreview(session.id),
    displayTitle: getSessionDisplayTitle(session),
  }));
}

export function findBestSessionForIdea(ideaId: string): string | null {
  const active = getDb()
    .prepare(
      `SELECT id FROM sessions WHERE active_idea_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .get(ideaId) as { id: string } | undefined;
  if (active) return active.id;

  const row = getDb()
    .prepare(
      `SELECT session_id, COUNT(*) as c FROM messages WHERE idea_id = ?
       GROUP BY session_id ORDER BY c DESC, session_id DESC LIMIT 1`
    )
    .get(ideaId) as { session_id: string } | undefined;
  return row?.session_id ?? null;
}

export function getMessagesForIdea(ideaId: string): ChatMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT m.*, s.title as session_title FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE m.idea_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(ideaId) as Record<string, unknown>[];

  return rows.map((row) => mapMessageRow(row));
}

/**
 * Resolve the full cluster of idea IDs an idea belongs to, using the same
 * transitive union-find grouping the sidebar shows. Returns at least [ideaId].
 */
export function getIdeaGroupIds(ideaId: string): string[] {
  const groups = buildIdeaGroups(listIdeas(), getAllIdeaLinks());
  const group = groups.find((g) => g.ideas.some((i) => i.id === ideaId));
  return group ? group.ideas.map((i) => i.id) : [ideaId];
}

/**
 * Combined "storyboard" thread for a group of related ideas: every message
 * from every idea in the cluster, ordered chronologically and de-duplicated,
 * each carrying its session + idea title so the UI can label per-idea sections.
 * Falls back to a single idea's thread when the idea has no related ideas.
 */
export function getMessagesForIdeaGroup(ideaId: string): ChatMessage[] {
  const ids = getIdeaGroupIds(ideaId);
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT m.*, s.title as session_title, i.title as idea_title FROM messages m
       JOIN sessions s ON s.id = m.session_id
       LEFT JOIN ideas i ON i.id = m.idea_id
       WHERE m.idea_id IN (${placeholders})
       ORDER BY m.created_at ASC`
    )
    .all(...ids) as Record<string, unknown>[];

  const seen = new Set<string>();
  const messages: ChatMessage[] = [];
  for (const row of rows) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    messages.push(mapMessageRow(row));
  }
  return messages;
}

function mapMessageRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessage["role"],
    content: row.content as string,
    agentId: (row.agent_id as BmadAgentId) ?? undefined,
    honestyBreakdown: row.honesty_breakdown
      ? (JSON.parse(row.honesty_breakdown as string) as HonestyBreakdown)
      : row.honesty_score
        ? legacyHonestyToBreakdown(JSON.parse(row.honesty_score as string))
        : undefined,
    depthScore: row.depth_score
      ? (JSON.parse(row.depth_score as string) as DepthScore)
      : undefined,
    ideaId: (row.idea_id as string) ?? undefined,
    relatedIdeas: row.related_ideas
      ? (JSON.parse(row.related_ideas as string) as ChatMessage["relatedIdeas"])
      : undefined,
    routeReason: (row.route_reason as string) ?? undefined,
    matchedAgents: row.matched_agents
      ? (JSON.parse(row.matched_agents as string) as ChatMessage["matchedAgents"])
      : undefined,
    perspectives: row.perspectives
      ? (JSON.parse(row.perspectives as string) as ChatMessage["perspectives"])
      : undefined,
    showForgeActions: Boolean(row.show_forge_actions),
    sessionTitle: (row.session_title as string) ?? undefined,
    ideaTitle: (row.idea_title as string) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export function getMostRecentSessionWithMessages(): ChatSession | null {
  const row = getDb()
    .prepare(
      `SELECT s.* FROM sessions s
       INNER JOIN messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC
       LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    activeAgentId: row.active_agent_id as BmadAgentId,
    activeIdeaId: (row.active_idea_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function createSessionForIdea(ideaId: string): ChatSession {
  const idea = getIdea(ideaId);
  const title = idea ? normalizeConversationTitle(idea.title) : "Idea thread";
  const session = createSession(title.slice(0, 60), "deep-recon");
  updateSession(session.id, { activeIdeaId: ideaId });
  return getSession(session.id)!;
}

export function getIdeaLinks(ideaId: string): IdeaLink[] {
  const rows = getDb()
    .prepare("SELECT * FROM idea_links WHERE idea_id = ? ORDER BY score DESC")
    .all(ideaId) as Record<string, unknown>[];
  return rows.map((r) => ({
    ideaId: r.idea_id as string,
    relatedId: r.related_id as string,
    score: r.score as number,
    reason: r.reason as string,
  }));
}

export function createSession(title: string, agentId: BmadAgentId): ChatSession {
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: uuidv4(),
    title,
    activeAgentId: agentId,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO sessions (id, title, active_agent_id, active_idea_id, pinned, pinned_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(session.id, session.title, session.activeAgentId, null, 0, null, now, now);
  return session;
}

function mapSessionRow(row: Record<string, unknown>): ChatSession {
  return {
    id: row.id as string,
    title: row.title as string,
    activeAgentId: row.active_agent_id as BmadAgentId,
    activeIdeaId: (row.active_idea_id as string) ?? undefined,
    pinned: Boolean(row.pinned),
    pinnedAt: (row.pinned_at as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function getSession(id: string): ChatSession | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return mapSessionRow(row);
}

export function listSessions(): ChatSession[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM sessions
       ORDER BY pinned DESC, COALESCE(pinned_at, updated_at) DESC, updated_at DESC
       LIMIT 50`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapSessionRow);
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, "title" | "activeAgentId" | "pinned" | "pinnedAt">> & {
    activeIdeaId?: string | null;
  }
) {
  const now = new Date().toISOString();
  const session = getSession(id);
  if (!session) return;

  const nextIdeaId =
    patch.activeIdeaId !== undefined ? patch.activeIdeaId ?? null : session.activeIdeaId ?? null;
  const nextPinned = patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : session.pinned ? 1 : 0;
  const nextPinnedAt =
    patch.pinnedAt !== undefined
      ? patch.pinnedAt
      : patch.pinned === true
        ? now
        : patch.pinned === false
          ? null
          : session.pinnedAt ?? null;

  getDb()
    .prepare(
      `UPDATE sessions SET title = ?, active_agent_id = ?, active_idea_id = ?, pinned = ?, pinned_at = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      patch.title ?? session.title,
      patch.activeAgentId ?? session.activeAgentId,
      nextIdeaId,
      nextPinned,
      nextPinnedAt,
      now,
      id
    );
}

/** Backfill readable titles for sessions that still have placeholder names. */
export function repairGenericSessionTitles(): number {
  let fixed = 0;

  for (const session of listSessions()) {
    if (!isGenericSessionTitle(session.title)) continue;

    const idea = session.activeIdeaId ? getIdea(session.activeIdeaId) : null;
    let nextTitle: string | null = null;

    if (idea) {
      nextTitle = normalizeConversationTitle(idea.title);
      if (idea.title !== nextTitle) {
        upsertIdea({
          id: idea.id,
          title: nextTitle,
          summary: idea.summary,
          tags: idea.tags,
          status: idea.status,
        });
      }
    } else {
      const firstUser = getDb()
        .prepare(
          `SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`
        )
        .get(session.id) as { content: string } | undefined;
      if (firstUser?.content) {
        nextTitle = normalizeConversationTitle(firstUser.content);
      }
    }

    if (nextTitle && !isGenericSessionTitle(nextTitle) && nextTitle !== session.title) {
      updateSession(session.id, { title: nextTitle.slice(0, 60) });
      fixed += 1;
    }
  }

  return fixed;
}

export function updateMessageHonestyBreakdown(messageId: string, breakdown: HonestyBreakdown) {
  getDb()
    .prepare(`UPDATE messages SET honesty_breakdown = ? WHERE id = ?`)
    .run(JSON.stringify(breakdown), messageId);
}

export function saveMessage(msg: Omit<ChatMessage, "createdAt"> & { createdAt?: string }) {
  const createdAt = msg.createdAt ?? new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO messages (id, session_id, role, content, agent_id, honesty_score, honesty_breakdown, depth_score, idea_id, related_ideas, route_reason, matched_agents, perspectives, show_forge_actions, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.id,
      msg.sessionId,
      msg.role,
      msg.content,
      msg.agentId ?? null,
      null,
      msg.honestyBreakdown ? JSON.stringify(msg.honestyBreakdown) : null,
      msg.depthScore ? JSON.stringify(msg.depthScore) : null,
      msg.ideaId ?? null,
      msg.relatedIdeas ? JSON.stringify(msg.relatedIdeas) : null,
      msg.routeReason ?? null,
      msg.matchedAgents ? JSON.stringify(msg.matchedAgents) : null,
      msg.perspectives ? JSON.stringify(msg.perspectives) : null,
      msg.showForgeActions ? 1 : 0,
      createdAt
    );
  updateSession(msg.sessionId, {});
}

export function getMessages(sessionId: string): ChatMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Record<string, unknown>[];
  return rows.map((row) => mapMessageRow(row));
}

export function getIdeaHonestySnapshot(ideaId: string): HonestyBreakdown | null {
  const row = getDb().prepare("SELECT honesty_snapshot FROM ideas WHERE id = ?").get(ideaId) as
    | { honesty_snapshot: string | null }
    | undefined;
  if (!row?.honesty_snapshot) return null;
  try {
    return JSON.parse(row.honesty_snapshot) as HonestyBreakdown;
  } catch {
    return null;
  }
}

export function updateIdeaHonestySnapshot(ideaId: string, breakdown: HonestyBreakdown) {
  const now = new Date().toISOString();
  getDb()
    .prepare(`UPDATE ideas SET honesty_snapshot = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(breakdown), now, ideaId);
}

export function getCrossChatContext(ideaId: string, excludeSessionId: string): string {
  const messages = getMessagesForIdea(ideaId).filter((m) => m.sessionId !== excludeSessionId);
  if (messages.length === 0) return "";

  const snippets = messages.slice(-8).map((m) => {
    const who = m.role === "user" ? "You" : m.agentId ?? "Assistant";
    const chat = m.sessionTitle ?? "Another chat";
    return `[${chat}] ${who}: ${m.content.slice(0, 220).replace(/\s+/g, " ")}`;
  });

  return `You've explored this idea in other chats:\n${snippets.join("\n")}`;
}

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

export function getThoughtsForIdea(ideaId: string): IdeaThought[] {
  const messages = getMessagesForIdea(ideaId);
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      ideaId: m.ideaId ?? ideaId,
      ideaTitle: m.ideaTitle ?? getIdea(ideaId)?.title ?? "",
      sessionId: m.sessionId,
      sessionTitle: m.sessionTitle ?? "Chat",
      role: m.role,
      excerpt: m.content.slice(0, 160).replace(/\s+/g, " "),
      createdAt: m.createdAt,
    }));
}

export function listAllIdeaThoughts(): IdeaThought[] {
  const ideas = listIdeas();
  const out: IdeaThought[] = [];
  for (const idea of ideas) {
    out.push(...getThoughtsForIdea(idea.id));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function ideaIdsLinkedToSession(sessionId: string): string[] {
  const database = getDb();
  const fromMessages = (
    database
      .prepare(
        `SELECT DISTINCT idea_id as id FROM messages WHERE session_id = ? AND idea_id IS NOT NULL`
      )
      .all(sessionId) as Array<{ id: string }>
  ).map((r) => r.id);

  const userTexts = getMessages(sessionId)
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase());

  const orphans = listIdeas()
    .filter((idea) => {
      if (fromMessages.includes(idea.id)) return false;
      const fragment = idea.title.toLowerCase().trim();
      if (fragment.length < 8) return false;
      return userTexts.some(
        (text) =>
          text.includes(fragment.slice(0, Math.min(24, fragment.length))) ||
          (text.length >= 12 && fragment.includes(text.slice(0, Math.min(24, text.length))))
      );
    })
    .map((i) => i.id);

  return [...new Set([...fromMessages, ...orphans])];
}

function scoreIdeaAsCanonical(ideaId: string, sessionId: string): number {
  const idea = getIdea(ideaId);
  if (!idea) return -1;

  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as c FROM messages WHERE session_id = ? AND idea_id = ?`
    )
    .get(sessionId, ideaId) as { c: number };

  let score = row.c * 100 + idea.title.length + idea.summary.length * 0.1;
  if (/storyboard|story board|generate.*stor/i.test(`${idea.title} ${idea.summary}`)) {
    score += 250;
  }
  if (idea.title.length < 18) score -= 80;
  if (/^(what|how|not sure|and |maybe)/i.test(idea.title)) score -= 100;
  return score;
}

function repointIdeaLinks(
  database: Database.Database,
  canonicalId: string,
  dupId: string
): void {
  const asIdea = database
    .prepare(`SELECT related_id, score, reason FROM idea_links WHERE idea_id = ?`)
    .all(dupId) as Array<{ related_id: string; score: number; reason: string }>;

  for (const row of asIdea) {
    const relatedId = row.related_id === dupId ? canonicalId : row.related_id;
    if (relatedId === canonicalId) {
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(dupId, row.related_id);
      continue;
    }
    const existing = database
      .prepare(`SELECT 1 FROM idea_links WHERE idea_id = ? AND related_id = ?`)
      .get(canonicalId, relatedId);
    if (existing) {
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(dupId, row.related_id);
    } else {
      database
        .prepare(
          `INSERT INTO idea_links (idea_id, related_id, score, reason) VALUES (?, ?, ?, ?)`
        )
        .run(canonicalId, relatedId, row.score, row.reason);
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(dupId, row.related_id);
    }
  }

  const asRelated = database
    .prepare(`SELECT idea_id, score, reason FROM idea_links WHERE related_id = ?`)
    .all(dupId) as Array<{ idea_id: string; score: number; reason: string }>;

  for (const row of asRelated) {
    const ideaId = row.idea_id === dupId ? canonicalId : row.idea_id;
    if (ideaId === canonicalId) {
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(row.idea_id, dupId);
      continue;
    }
    const existing = database
      .prepare(`SELECT 1 FROM idea_links WHERE idea_id = ? AND related_id = ?`)
      .get(ideaId, canonicalId);
    if (existing) {
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(row.idea_id, dupId);
    } else {
      database
        .prepare(
          `INSERT INTO idea_links (idea_id, related_id, score, reason) VALUES (?, ?, ?, ?)`
        )
        .run(ideaId, canonicalId, row.score, row.reason);
      database
        .prepare(`DELETE FROM idea_links WHERE idea_id = ? AND related_id = ?`)
        .run(row.idea_id, dupId);
    }
  }
}

export function mergeIdeasInto(canonicalId: string, duplicateIds: string[]): void {
  const database = getDb();
  const canonical = getIdea(canonicalId);
  if (!canonical) return;

  let bestTitle = canonical.title;
  let bestSummary = canonical.summary;
  const mergedTags = new Set(canonical.tags);

  for (const dupId of duplicateIds) {
    if (dupId === canonicalId) continue;
    const dup = getIdea(dupId);
    if (!dup) continue;

    if (dup.summary.length > bestSummary.length) bestSummary = dup.summary;
    if (dup.title.length > bestTitle.length && !/^(what|and |not sure)/i.test(dup.title)) {
      bestTitle = dup.title;
    }
    dup.tags.forEach((t) => mergedTags.add(t));

    database.prepare(`UPDATE messages SET idea_id = ? WHERE idea_id = ?`).run(canonicalId, dupId);
    database
      .prepare(`UPDATE sessions SET active_idea_id = ? WHERE active_idea_id = ?`)
      .run(canonicalId, dupId);

    repointIdeaLinks(database, canonicalId, dupId);

    const dupHonesty = database
      .prepare(`SELECT honesty_snapshot FROM ideas WHERE id = ?`)
      .get(dupId) as { honesty_snapshot: string | null } | undefined;
    const canonHonesty = database
      .prepare(`SELECT honesty_snapshot FROM ideas WHERE id = ?`)
      .get(canonicalId) as { honesty_snapshot: string | null } | undefined;
    if (dupHonesty?.honesty_snapshot && !canonHonesty?.honesty_snapshot) {
      database
        .prepare(`UPDATE ideas SET honesty_snapshot = ? WHERE id = ?`)
        .run(dupHonesty.honesty_snapshot, canonicalId);
    }

    database.prepare(`DELETE FROM ideas WHERE id = ?`).run(dupId);
  }

  upsertIdea({
    id: canonicalId,
    title: bestTitle.slice(0, 200),
    summary: bestSummary.slice(0, 500),
    tags: [...mergedTags],
  });
}

/** Merge duplicate idea records that belong to the same conversation. */
export function consolidateDuplicateSessionIdeas(): { sessionsFixed: number; ideasMerged: number } {
  let sessionsFixed = 0;
  let ideasMerged = 0;

  for (const session of listSessions()) {
    const ideaIds = ideaIdsLinkedToSession(session.id);
    if (ideaIds.length === 0) continue;

    const ranked = ideaIds
      .map((id) => ({ id, score: scoreIdeaAsCanonical(id, session.id) }))
      .filter((x) => x.score > -1)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) continue;

    const canonicalId = ranked[0].id;
    const duplicateIds = ranked.slice(1).map((x) => x.id);

    if (duplicateIds.length > 0) {
      mergeIdeasInto(canonicalId, duplicateIds);
      sessionsFixed += 1;
      ideasMerged += duplicateIds.length;
    }

    const canonical = getIdea(canonicalId);
    updateSession(session.id, {
      activeIdeaId: canonicalId,
      title: canonical?.title.slice(0, 60) ?? session.title,
    });
  }

  return { sessionsFixed, ideasMerged };
}
