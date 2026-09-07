"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentInfo, IdeaRecord } from "@/lib/types";
import { IdeaSidebar } from "@/components/IdeaSidebar";
import { ChatWindow } from "@/components/ChatWindow";

export default function HomePage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [ideas, setIdeas] = useState<IdeaRecord[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | undefined>();
  const [cursorApiConfigured, setCursorApiConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIdeas = useCallback(async () => {
    const res = await fetch("/api/ideas");
    if (!res.ok) throw new Error("Failed to load ideas");
    const data = await res.json();
    setIdeas(data.ideas ?? []);
  }, []);

  const init = useCallback(async () => {
    setError(null);
    try {
      const [agentsRes, sessionRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/sessions", {
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
      setError(e instanceof Error ? e.message : "Failed to start app");
      setReady(false);
    }
  }, [loadIdeas]);

  useEffect(() => {
    init();
  }, [init]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-300">
        <p className="text-rose-400">Could not load Idea Forge</p>
        <p className="max-w-md text-center text-sm text-zinc-500">{error}</p>
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
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading Idea Forge...
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
