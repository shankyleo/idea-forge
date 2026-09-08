"use client";

import { useState } from "react";
import { AppWindow, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRecord } from "@/lib/types";

export function PromoteAppBar({
  alreadyPromoted,
  onOpenApp,
  onPromote,
  disabled,
}: {
  alreadyPromoted?: boolean;
  onOpenApp?: () => void;
  onPromote: (input: { localPath: string; githubRepo?: string }) => Promise<string | null>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  async function browseFolder() {
    setError(null);
    setPicking(true);
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
      const data = (await res.json()) as { path?: string; cancelled?: boolean; error?: string };
      if (data.cancelled) return;
      if (!res.ok || data.error) {
        setError(data.error || "Could not open the folder picker.");
        return;
      }
      if (data.path) setLocalPath(data.path);
    } catch {
      setError("Could not open the folder picker.");
    } finally {
      setPicking(false);
    }
  }

  if (alreadyPromoted) {
    return (
      <div className="mt-4 border-t border-zinc-700/40 pt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenApp}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
        >
          Open in Apps
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-zinc-700/40 pt-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Winston — ready to commit this as an app
      </p>
      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-slate-500/40 bg-slate-500/10 px-3 py-1.5 text-xs font-medium text-slate-200",
            "hover:bg-slate-500/20 disabled:opacity-40"
          )}
        >
          <AppWindow className="h-3.5 w-3.5" />
          Promote to an app
        </button>
      ) : (
        <form
          className="space-y-2 rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setSaving(true);
            void onPromote({
              localPath: localPath.trim(),
              githubRepo: githubRepo.trim() || undefined,
            }).then((err) => {
              setSaving(false);
              if (err) setError(err);
              else setOpen(false);
            });
          }}
        >
          <label className="block text-xs text-zinc-400">
            Local folder
            <div className="mt-1 flex gap-2">
              <input
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/Users/you/dev/storyboard-app"
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none"
                required
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void browseFolder()}
                disabled={picking || saving || disabled}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {picking ? "Picking…" : "Browse"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Browse opens a folder dialog on this computer. You can still paste a path.
            </p>
          </label>
          <label className="block text-xs text-zinc-400">
            GitHub repo <span className="text-zinc-600">(optional — add later)</span>
            <input
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none"
              autoComplete="off"
            />
          </label>
          <p className="text-xs text-zinc-400">
            Writes <span className="font-mono text-zinc-300">START.md</span>,{" "}
            <span className="font-mono text-zinc-300">APP.md</span>,{" "}
            <span className="font-mono text-zinc-300">SPEC.md</span>,{" "}
            <span className="font-mono text-zinc-300">ARCHITECTURE.md</span>, and{" "}
            <span className="font-mono text-zinc-300">BUILD.md</span> into that folder (those names
            are overwritten). GitHub can wait — attach it from Apps when you have a link.
          </p>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || picking || disabled}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {saving ? "Promoting…" : "Create app"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AttachGithubForm({
  onAttach,
}: {
  onAttach: (githubRepo: string) => Promise<string | null>;
}) {
  const [githubRepo, setGithubRepo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaving(true);
        void onAttach(githubRepo.trim()).then((err) => {
          setSaving(false);
          if (err) setError(err);
        });
      }}
    >
      <label className="block text-xs text-zinc-400">
        GitHub repo
        <input
          value={githubRepo}
          onChange={(e) => setGithubRepo(e.target.value)}
          placeholder="owner/repo or https://github.com/owner/repo"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none"
          required
          autoComplete="off"
        />
      </label>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
      >
        {saving ? "Attaching…" : "Attach GitHub"}
      </button>
    </form>
  );
}

export function AppsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <AppWindow className="mb-3 h-8 w-8 text-slate-400" />
      <p className="text-sm text-zinc-300">No apps yet</p>
      <p className="mt-2 max-w-md text-xs text-zinc-500">
        In Ideas, ask Winston for a plan (via /winston or auto-route), then use{" "}
        <strong>Promote to an app</strong>. Each app gets its own chat with Winston, John, Sally,
        and Amelia. GitHub is optional — attach it later.
      </p>
    </div>
  );
}

export function AppWorkspace({
  apps,
  activeAppId,
  onSelect,
  onOpenChat,
  onAttachGithub,
}: {
  apps: AppRecord[];
  activeAppId?: string;
  onSelect: (_id: string) => void;
  onOpenChat: (sessionId: string) => void;
  onAttachGithub?: (appId: string, githubRepo: string) => Promise<string | null>;
}) {
  const active = apps.find((a) => a.id === activeAppId) ?? apps[0];

  if (apps.length === 0) {
    return <AppsEmptyState />;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto px-4 py-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">App</p>
      <h1 className="mt-1 text-lg font-semibold text-white">{active.title}</h1>
      <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{active.objective}</p>

      <dl className="mt-4 grid gap-2 text-xs text-zinc-400">
        <div>
          <dt className="text-zinc-600">Folder</dt>
          <dd className="break-all font-mono text-zinc-200">{active.localPath}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">GitHub</dt>
          <dd>
            {active.githubRepo ? (
              <a
                href={`https://github.com/${active.githubRepo}`}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300"
              >
                {active.githubRepo}
              </a>
            ) : (
              <span className="text-zinc-500">Not set yet</span>
            )}
          </dd>
        </div>
      </dl>

      {!active.githubRepo && onAttachGithub && (
        <AttachGithubForm onAttach={(repo) => onAttachGithub(active.id, repo)} />
      )}

      <pre className="mt-5 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-200">
        {active.getStarted}
      </pre>

      {active.ghStatus && !active.getStarted.includes(active.ghStatus) && (
        <p className="mt-3 text-xs text-zinc-500">{active.ghStatus}</p>
      )}

      <button
        type="button"
        onClick={() => onOpenChat(active.sessionId)}
        className="mt-4 self-start rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        Open source chat
      </button>
    </div>
  );
}
