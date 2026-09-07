import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type {
  BmadAgentId,
  ChatMessage,
  ChatSession,
  HonestyScore,
  IdeaLink,
  IdeaRecord,
} from "@/lib/types";
import { slugify } from "@/lib/utils";

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
}

function rowToIdea(row: Record<string, unknown>): IdeaRecord {
  return {
    id: row.id as string,
    title: row.title as string,
    summary: row.summary as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    status: row.status as IdeaRecord["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listIdeas(): IdeaRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM ideas ORDER BY updated_at DESC")
    .all() as Record<string, unknown>[];
  return rows.map(rowToIdea);
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
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO sessions (id, title, active_agent_id, active_idea_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(session.id, session.title, session.activeAgentId, null, now, now);
  return session;
}

export function getSession(id: string): ChatSession | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
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

export function listSessions(): ChatSession[] {
  const rows = getDb()
    .prepare("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT 50")
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    activeAgentId: row.active_agent_id as BmadAgentId,
    activeIdeaId: (row.active_idea_id as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ChatSession, "title" | "activeAgentId" | "activeIdeaId">>
) {
  const now = new Date().toISOString();
  const session = getSession(id);
  if (!session) return;
  getDb()
    .prepare(
      `UPDATE sessions SET title = ?, active_agent_id = ?, active_idea_id = ?, updated_at = ? WHERE id = ?`
    )
    .run(
      patch.title ?? session.title,
      patch.activeAgentId ?? session.activeAgentId,
      patch.activeIdeaId ?? session.activeIdeaId ?? null,
      now,
      id
    );
}

export function saveMessage(msg: Omit<ChatMessage, "createdAt"> & { createdAt?: string }) {
  const createdAt = msg.createdAt ?? new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO messages (id, session_id, role, content, agent_id, honesty_score, idea_id, related_ideas, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.id,
      msg.sessionId,
      msg.role,
      msg.content,
      msg.agentId ?? null,
      msg.honestyScore ? JSON.stringify(msg.honestyScore) : null,
      msg.ideaId ?? null,
      msg.relatedIdeas ? JSON.stringify(msg.relatedIdeas) : null,
      createdAt
    );
  updateSession(msg.sessionId, {});
}

export function getMessages(sessionId: string): ChatMessage[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessage["role"],
    content: row.content as string,
    agentId: (row.agent_id as BmadAgentId) ?? undefined,
    honestyScore: row.honesty_score
      ? (JSON.parse(row.honesty_score as string) as HonestyScore)
      : undefined,
    ideaId: (row.idea_id as string) ?? undefined,
    relatedIdeas: row.related_ideas
      ? (JSON.parse(row.related_ideas as string) as ChatMessage["relatedIdeas"])
      : undefined,
    createdAt: row.created_at as string,
  }));
}
