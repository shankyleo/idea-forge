"use client";

import {
  History,
  Lightbulb,
  Link2,
  MessagesSquare,
  MessageSquarePlus,
  Network,
} from "lucide-react";
import type { ChatSession, IdeaGroup, IdeaRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SidebarTab = "chat" | "idea" | "history";

const LAST_SESSION_KEY = "idea-forge:lastSessionId";

export function getStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_SESSION_KEY);
}

export function storeSessionId(id: string) {
  localStorage.setItem(LAST_SESSION_KEY, id);
}

interface IdeaSidebarProps {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  groups: IdeaGroup[];
  sessions: ChatSession[];
  linkCount?: number;
  activeIdeaId?: string;
  activeSessionId?: string;
  ideaDetail?: IdeaRecord | null;
  relatedIdeas?: Array<IdeaRecord & { linkReason: string; score: number }>;
  onSelectIdea: (ideaId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClearIdea: () => void;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function IdeaSidebar({
  tab,
  onTabChange,
  groups,
  sessions,
  linkCount = 0,
  activeIdeaId,
  activeSessionId,
  ideaDetail,
  relatedIdeas = [],
  onSelectIdea,
  onSelectSession,
  onNewSession,
  onClearIdea,
}: IdeaSidebarProps) {
  const totalIdeas = groups.reduce((n, g) => n + g.ideas.length, 0);

  const tabs: Array<{ id: SidebarTab; label: string; icon: typeof History }> = [
    { id: "chat", label: "Chat", icon: MessagesSquare },
    { id: "idea", label: "Idea", icon: Network },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950/80">
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="flex gap-1 rounded-lg bg-zinc-900/80 p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === id ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <>
          <div className="border-b border-zinc-800 px-3 py-2">
            <button
              type="button"
              onClick={onNewSession}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600/90 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New conversation
            </button>
          </div>
          <div className="border-b border-zinc-800 px-4 py-2">
            <p className="text-xs text-zinc-500">
              {totalIdeas} ideas captured from your chats
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Open the Idea tab for the map · History for past conversations
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {groups.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">
                Ideas appear as you chat. Describe products, angles, or concepts — the team will
                weigh in.
              </p>
            ) : (
              <ul className="space-y-1">
                {groups.flatMap((g) => g.ideas).map((idea) => (
                  <li key={idea.id}>
                    <button
                      type="button"
                      onClick={() => onSelectIdea(idea.id)}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors text-zinc-300 hover:bg-zinc-800/60"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Lightbulb className="h-3 w-3 shrink-0 text-amber-400/80" />
                        <span className="font-medium line-clamp-2">{idea.title}</span>
                      </div>
                      {idea.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 pl-4">
                          {idea.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === "idea" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <Network className="h-4 w-4 text-amber-400" />
            Idea map
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            See how ideas connect across chats. Each dot is an idea; lines show relationships.
            Hover for thoughts from different conversations.
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            {totalIdeas} ideas · {linkCount} connections
          </p>
          <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
            <li className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Click an idea to open the chat where you last discussed it.
            </li>
          </ul>
        </div>
      )}

      {tab === "history" && (
        <>
          <div className="border-b border-zinc-800 px-3 py-2">
            <button
              type="button"
              onClick={onNewSession}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600/90 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New conversation
            </button>
          </div>
          <div className="border-b border-zinc-800 px-4 py-2">
            <p className="text-[10px] text-zinc-600">
              Chronological log of every past conversation. Pick one to resume the full chat.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">No past conversations yet.</p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSession(session.id)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                        activeSessionId === session.id
                          ? "bg-indigo-600/15 ring-1 ring-indigo-500/30"
                          : "hover:bg-zinc-800/60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-200 line-clamp-1">
                          {session.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-zinc-600">
                          {formatWhen(session.updatedAt)}
                        </span>
                      </div>
                      {session.preview && (
                        <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{session.preview}</p>
                      )}
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {session.messageCount ?? 0} messages
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

interface RelatedIdeasProps {
  related: Array<{ id: string; title: string; score: number; reason: string }>;
  onContinue?: (ideaId: string) => void;
}

export function RelatedIdeas({ related, onContinue }: RelatedIdeasProps) {
  if (related.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
        <Link2 className="h-3.5 w-3.5" />
        Related ideas from other chats
      </div>
      <ul className="mt-1.5 space-y-1">
        {related.map((r) => (
          <li key={r.id} className="text-xs text-zinc-400">
            {onContinue ? (
              <button
                type="button"
                onClick={() => onContinue(r.id)}
                className="text-left hover:text-zinc-200"
              >
                <span className="text-zinc-300">{r.title}</span>
                <span className="text-zinc-600"> — {r.reason}</span>
              </button>
            ) : (
              <>
                <span className="text-zinc-300">{r.title}</span>
                <span className="text-zinc-600"> — {r.reason}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
