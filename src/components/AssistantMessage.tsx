"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentPerspective } from "@/lib/types";
import { AgentIcon } from "@/components/AgentIcon";
import { cn } from "@/lib/utils";

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-1 text-lg font-semibold text-white">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold text-zinc-100">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-3 text-sm font-semibold text-zinc-200">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 text-sm leading-relaxed text-zinc-200 last:mb-0">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-zinc-300">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-zinc-300">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-100">{children}</strong>
  ),
  hr: () => <hr className="my-4 border-zinc-700/60" />,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-zinc-700/50">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-zinc-800/80 text-zinc-400">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 font-medium">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border-t border-zinc-800 px-3 py-2 text-zinc-300">{children}</td>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-400 underline decoration-indigo-500/40 hover:text-indigo-300"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-amber-500/50 pl-3 text-sm italic text-zinc-400">
      {children}
    </blockquote>
  ),
};

const perspectiveMarkdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-xs leading-relaxed text-zinc-400 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-zinc-200">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-zinc-300">{children}</em>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function PerspectiveCards({ perspectives }: { perspectives: AgentPerspective[] }) {
  if (perspectives.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Panel perspectives
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {perspectives.map((p) => (
          <div
            key={p.agentId}
            className="rounded-xl border border-zinc-700/50 bg-zinc-900/50 p-3.5"
            style={{ borderLeftWidth: 3, borderLeftColor: p.color }}
          >
            <div className="mb-2 flex items-start gap-2.5">
              <AgentIcon agentId={p.agentId} className="h-8 w-8 shrink-0" color={p.color} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold" style={{ color: p.color }}>
                    {p.name}
                  </span>
                  <span className="text-[10px] text-zinc-600">{p.role}</span>
                </div>
              </div>
            </div>
            <div className="text-xs leading-relaxed text-zinc-400 [&_p]:mb-1.5 [&_p:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={perspectiveMarkdownComponents}>
                {p.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ForgeActionBarProps {
  onAction: (text: string) => void;
  disabled?: boolean;
}

export function ForgeActionBar({ onAction, disabled }: ForgeActionBarProps) {
  return (
    <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-700/40 pt-3">
      <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        BMAD Forge — pressure test
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("attack this")}
        className={cn(
          "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200",
          "hover:bg-red-500/20 disabled:opacity-40"
        )}
      >
        Attack this
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("defend this")}
        className={cn(
          "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200",
          "hover:bg-emerald-500/20 disabled:opacity-40"
        )}
      >
        Defend this
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("what's missing from this idea?")}
        className={cn(
          "rounded-lg border border-zinc-600 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-300",
          "hover:bg-zinc-800 disabled:opacity-40"
        )}
      >
        What&apos;s missing?
      </button>
    </div>
  );
}
