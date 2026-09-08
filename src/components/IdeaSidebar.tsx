"use client";

import {
  AppWindow,
  Lightbulb,
  Link2,
  MessagesSquare,
  MessageSquarePlus,
  PanelLeft,
  PanelLeftClose,
  Pin,
} from "lucide-react";
import type { AppRecord, IdeaGroup, IdeaRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizeConversationTitle } from "@/lib/session-titles";

export type SidebarTab = "chat" | "app";

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
  activeIdeaId?: string;
  onSelectIdea: (ideaId: string) => void;
  onNewSession: () => void;
  onTogglePinIdea?: (ideaId: string, pinned: boolean) => void | Promise<void>;
  onCloseMobile?: () => void;
  apps?: AppRecord[];
  activeAppId?: string;
  onSelectApp?: (appId: string) => void;
}

export function NavToggleButton({
  onClick,
  open = false,
  visibleOnDesktop = false,
}: {
  onClick: () => void;
  open?: boolean;
  visibleOnDesktop?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mt-0.5 shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
        !visibleOnDesktop && "md:hidden"
      )}
      aria-label="Open sidebar"
      aria-expanded={open}
      aria-controls="app-nav"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  );
}

export function IdeaSidebar({
  tab,
  onTabChange,
  groups,
  activeIdeaId,
  onSelectIdea,
  onNewSession,
  onTogglePinIdea,
  onCloseMobile,
  apps = [],
  activeAppId,
  onSelectApp,
}: IdeaSidebarProps) {
  const totalIdeas = groups.reduce((n, g) => n + g.ideas.length, 0);
  const allIdeas = groups.flatMap((g) => g.ideas);
  const pinnedIdeas = allIdeas.filter((i) => i.pinned);
  const unpinnedIdeas = allIdeas.filter((i) => !i.pinned);

  const renderIdea = (idea: IdeaRecord) => (
    <li key={idea.id}>
      <div
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-2 transition-colors",
          activeIdeaId === idea.id ? "bg-indigo-600/15 ring-1 ring-indigo-500/30" : "hover:bg-zinc-800/60"
        )}
      >
        <button
          type="button"
          onClick={() => onSelectIdea(idea.id)}
          className="min-w-0 flex-1 text-left text-sm text-zinc-300"
        >
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3 shrink-0 text-amber-400/80" />
            <span className="font-medium line-clamp-2">
              {normalizeConversationTitle(idea.title)}
            </span>
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
        {onTogglePinIdea && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onTogglePinIdea(idea.id, !idea.pinned);
            }}
            className={cn(
              "mt-0.5 shrink-0 rounded p-1 transition-colors",
              idea.pinned
                ? "text-amber-400 hover:bg-amber-500/10"
                : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
            )}
            title={idea.pinned ? "Unpin conversation" : "Pin conversation"}
            aria-label={idea.pinned ? "Unpin conversation" : "Pin conversation"}
          >
            <Pin className={cn("h-3.5 w-3.5", idea.pinned && "fill-current")} />
          </button>
        )}
      </div>
    </li>
  );

  const tabs: Array<{ id: SidebarTab; label: string; icon: typeof MessagesSquare }> = [
    { id: "chat", label: "Ideas", icon: MessagesSquare },
    { id: "app", label: "Apps", icon: AppWindow },
  ];

  return (
    <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1 rounded-lg bg-zinc-900/80 p-1" role="tablist" aria-label="Workspace">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors sm:text-xs",
                tab === id ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
          </div>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          )}
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
              {totalIdeas} conversation{totalIdeas === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Pin conversations you want quick access to
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {allIdeas.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">
                Conversations appear as you chat. Describe products, angles, or concepts — the team
                will weigh in.
              </p>
            ) : (
              <ul className="space-y-1">
                {pinnedIdeas.length > 0 && (
                  <>
                    <li className="px-3 pt-1 text-[10px] font-medium uppercase tracking-wide text-amber-500/80">
                      Pinned
                    </li>
                    {pinnedIdeas.map(renderIdea)}
                    {unpinnedIdeas.length > 0 && (
                      <li className="px-3 pt-3 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                        All conversations
                      </li>
                    )}
                  </>
                )}
                {unpinnedIdeas.map(renderIdea)}
              </ul>
            )}
          </div>
        </>
      )}

      {tab === "app" && (
        <div className="flex flex-1 flex-col">
          <div className="border-b border-zinc-800 px-4 py-2">
            <p className="text-xs text-zinc-500">
              {apps.length === 1 ? "1 app" : `${apps.length} apps`}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-600">
              Each app is its own chat. Winston, John, Sally, and Amelia build in the folder.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {apps.length === 0 ? (
              <p className="px-2 py-4 text-xs text-zinc-500">
                No apps yet. After Winston replies with a plan (via /winston or auto-route), use
                Promote to an app. That creates a dedicated chat for the build.
              </p>
            ) : (
              <ul className="space-y-1">
                {apps.map((app) => (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => onSelectApp?.(app.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-2 text-left text-sm transition-colors",
                        activeAppId === app.id
                          ? "bg-indigo-600/15 ring-1 ring-indigo-500/30"
                          : "hover:bg-zinc-800/60"
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-zinc-200">
                        <AppWindow className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="font-medium line-clamp-2">{app.title}</span>
                      </div>
                      <p className="mt-0.5 pl-4 text-[11px] text-zinc-500 line-clamp-2">
                        {app.githubRepo || app.localPath}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
