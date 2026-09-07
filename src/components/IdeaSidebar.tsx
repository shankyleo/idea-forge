"use client";

import type { IdeaRecord } from "@/lib/types";
import { Lightbulb, Link2 } from "lucide-react";

interface IdeaSidebarProps {
  ideas: IdeaRecord[];
  activeIdeaId?: string;
  onSelect?: (id: string) => void;
}

export function IdeaSidebar({ ideas, activeIdeaId, onSelect }: IdeaSidebarProps) {
  return (
    <aside className="flex h-full flex-col border-r border-zinc-800 bg-zinc-950/80">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Idea vault
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{ideas.length} ideas captured</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {ideas.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-500">
            Ideas appear here as you chat. Describe an app or product idea to get started.
          </p>
        ) : (
          <ul className="space-y-1">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(idea.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeIdeaId === idea.id
                      ? "bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/30"
                      : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="font-medium line-clamp-2">{idea.title}</div>
                  {idea.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
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
        Related ideas
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
