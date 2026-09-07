"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentInfo, IdeaRecord } from "@/lib/types";
import { IdeaSidebar } from "@/components/IdeaSidebar";
import { ChatWindow } from "@/components/ChatWindow";

const INIT_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: RequestInfo,
  init?: RequestInit,
  ms = INIT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [ideas, setIdeas] = useState<IdeaRecord[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | undefined>();
  const [cursorApiConfigured, setCursorApiConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    const res = await fetchWithTimeout("/api/ideas");
    if (!res.ok) throw new Error("Failed to load ideas");
    const data = await res.json();
    setIdeas(data.ideas ?? []);
  }, []);

  const init = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const [agentsRes, sessionRes] = await Promise.all([
        fetchWithTimeout("/api/agents"),
        fetchWithTimeout("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Thinking session", agentId: "deep-recon" }),
        }),
      ]);

      if (!agentsRes.ok) throw new Error(`Agents API failed (${agentsRes.status})`);
      if (!sessionRes.ok) throw new Error(`Session API failed (${sessionRes.status})`);

      const agentsData = await agentsRes.json();
      const sessionData = await sessionRes.json();

      if (!sessionData.session?.id) throw new Error("No session created");

      setAgents(agentsData.agents ?? []);
      setCursorApiConfigured(agentsData.cursorApiConfigured ?? false);
      setSessionId(sessionData.session.id);
      await loadIdeas();
      setReady(true);
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "AbortError";
      setError(
        isTimeout
          ? "Server not responding. Run npm run dev in the project folder, then open http://localhost:43123 on the same machine."
          : e instanceof Error
            ? e.message
            : "Failed to start app"
      );
      setReady(false);
    }
  }, [loadIdeas]);

  useEffect(() => {
    init();
  }, [init]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-zinc-300">
        <p className="text-rose-400">Could not load Idea Forge</p>
        <p className="max-w-md text-center text-sm text-zinc-500">{error}</p>
        <div className="max-w-md rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left text-xs text-zinc-400">
          <p className="font-medium text-zinc-300">Start the app on your machine:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-2 text-zinc-300">
            cd /path/to/idea-forge{"\n"}npm run dev
          </pre>
          <p className="mt-2">Then open http://localhost:43123 in your browser.</p>
        </div>
        <button
          type="button"
          onClick={init}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!ready || !sessionId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-400">
        <p>Loading Idea Forge...</p>
        <p className="text-xs text-zinc-600">If this hangs, run npm run dev first</p>
      </div>
    );
  }

  return (
    <main className="flex h-screen bg-zinc-950 text-zinc-100">
      <div className="hidden w-64 shrink-0 md:block lg:w-72">
        <IdeaSidebar
          ideas={ideas}
          activeIdeaId={activeIdeaId}
          onSelect={setActiveIdeaId}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ChatWindow
          sessionId={sessionId}
          agents={agents}
          cursorApiConfigured={cursorApiConfigured}
          onIdeasUpdated={loadIdeas}
        />
      </div>
    </main>
  );
}
