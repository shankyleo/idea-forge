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

  const loadIdeas = useCallback(async () => {
    const res = await fetch("/api/ideas");
    const data = await res.json();
    setIdeas(data.ideas ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      const [agentsRes, sessionRes] = await Promise.all([
        fetch("/api/agents"),
        fetch("/api/sessions", { method: "POST", body: JSON.stringify({ title: "Thinking session" }) }),
      ]);
      const agentsData = await agentsRes.json();
      const sessionData = await sessionRes.json();
      setAgents(agentsData.agents ?? []);
      setCursorApiConfigured(agentsData.cursorApiConfigured ?? false);
      setSessionId(sessionData.session?.id ?? null);
      await loadIdeas();
      setReady(true);
    }
    init();
  }, [loadIdeas]);

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
