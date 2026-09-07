"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const totalIdeas = groups.reduce((n, g) => n + g.ideas.length, 0);

  const toggleGroup = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
              {totalIdeas} ideas · {groups.filter((g) => g.ideas.length > 1).length} connected
              threads
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Related conversations cluster together. Click one to open its connected thread.
            </p>
          </div>

          {ideaDetail && (
            <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/80">
                    Active idea
                  </p>
                  <p className="mt-1 text-sm font-medium text-amber-100 line-clamp-2">
                    {ideaDetail.title}
                  </p>
                  {ideaDetail.summary && (
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-3">{ideaDetail.summary}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClearIdea}
                  className="shrink-0 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Clear
                </button>
              </div>
              {relatedIdeas.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {relatedIdeas.slice(0, 3).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => onSelectIdea(r.id)}
                        className="flex w-full items-start gap-1.5 text-left text-[11px] text-zinc-400 hover:text-zinc-200"
                      >
                        <Link2 className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          <span className="text-zinc-300">{r.title}</span>
                          <span className="text-zinc-600"> — {r.linkReason}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2">
            {groups.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">
                Ideas appear as you chat. Describe products, feedback, or concepts — they&apos;ll
                group when related.
              </p>
            ) : (
              <ul className="space-y-2">
                {groups.map((group) => {
                  const isMulti = group.ideas.length > 1;
                  const open = expanded[group.id] ?? isMulti;
                  return (
                    <li key={group.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/30">
                      {isMulti ? (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left"
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-zinc-300 truncate">{group.label}</p>
                            <p className="text-[10px] text-zinc-600">
                              {group.ideas.length} related ideas
                            </p>
                          </div>
                        </button>
                      ) : null}
                      {(open || !isMulti) && (
                        <ul className={cn(isMulti && "border-t border-zinc-800/60 px-1 pb-1")}>
                          {group.ideas.map((idea) => (
                            <li key={idea.id}>
                              <button
                                type="button"
                                onClick={() => onSelectIdea(idea.id)}
                                className={cn(
                                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                                  activeIdeaId === idea.id
                                    ? "bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/30"
                                    : "text-zinc-300 hover:bg-zinc-800/60"
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
                    </li>
                  );
                })}
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
            The panel on the right maps how your ideas connect. Each dot is an idea; lines are
            the connections between them, and related ideas share a color.
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">
            {totalIdeas} ideas · {linkCount} connections
          </p>
          <ul className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
            <li className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Hover a link to see why two ideas are connected.
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Thicker lines mean a stronger connection.
            </li>
            <li className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
              Click any idea to open its connected memory thread.
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
}

export function RelatedIdeas({ related }: RelatedIdeasProps) {
  if (related.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
        <Link2 className="h-3.5 w-3.5" />
        Related ideas in your vault
      </div>
      <ul className="mt-1.5 space-y-1">
        {related.map((r) => (
          <li key={r.id} className="text-xs text-zinc-400">
            <span className="text-zinc-300">{r.title}</span>
            <span className="text-zinc-600"> — {r.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
