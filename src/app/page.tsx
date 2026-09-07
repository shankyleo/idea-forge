"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentInfo, ChatSession, IdeaGroup, IdeaRecord } from "@/lib/types";
import { IdeaSidebar, getStoredSessionId, storeSessionId } from "@/components/IdeaSidebar";
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
  const [groups, setGroups] = useState<IdeaGroup[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | undefined>();
  const [ideaDetail, setIdeaDetail] = useState<IdeaRecord | null>(null);
  const [relatedIdeas, setRelatedIdeas] = useState<
    Array<IdeaRecord & { linkReason: string; score: number }>
  >([]);
  const [cursorApiConfigured, setCursorApiConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSidebar = useCallback(async () => {
    const [ideasRes, sessionsRes] = await Promise.all([
      fetchWithTimeout("/api/ideas?grouped=1"),
      fetchWithTimeout("/api/sessions"),
    ]);
    if (!ideasRes.ok || !sessionsRes.ok) throw new Error("Failed to load sidebar data");
    const ideasData = await ideasRes.json();
    const sessionsData = await sessionsRes.json();
    setGroups(ideasData.groups ?? []);
    setSessions(sessionsData.sessions ?? []);
  }, []);

  const loadIdeaDetail = useCallback(async (ideaId: string) => {
    const res = await fetchWithTimeout(`/api/ideas?id=${ideaId}`);
    if (!res.ok) return;
    const data = await res.json();
    setIdeaDetail(data.idea ?? null);
    setRelatedIdeas(data.related ?? []);
  }, []);

  const init = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const agentsRes = await fetchWithTimeout("/api/agents");
      if (!agentsRes.ok) throw new Error(`Agents API failed (${agentsRes.status})`);
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents ?? []);
      setCursorApiConfigured(agentsData.cursorApiConfigured ?? false);

      const storedId = getStoredSessionId();
      let session: ChatSession | null = null;

      if (storedId) {
        const resumeRes = await fetchWithTimeout(
          `/api/sessions?resume=1&lastId=${encodeURIComponent(storedId)}`
        );
        if (resumeRes.ok) {
          const data = await resumeRes.json();
          if (data.session?.id) session = data.session;
          if (data.sessions) setSessions(data.sessions);
        }
      }

      if (!session) {
        const listRes = await fetchWithTimeout("/api/sessions");
        if (listRes.ok) {
          const data = await listRes.json();
          const withMessages = (data.sessions as ChatSession[]).find(
            (s) => (s.messageCount ?? 0) > 0
          );
          if (withMessages) {
            session = withMessages;
          }
          setSessions(data.sessions ?? []);
        }
      }

      if (!session) {
        const createRes = await fetchWithTimeout("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Thinking session" }),
        });
        if (!createRes.ok) throw new Error("Session API failed");
        const data = await createRes.json();
        session = data.session;
      }

      if (!session?.id) throw new Error("No session available");

      storeSessionId(session.id);
      setSessionId(session.id);
      // Resume the full conversation, not a single idea's filtered thread —
      // a chat should stay together. The idea vault remains an explicit lens
      // the user can click into.

      await loadSidebar();
      setReady(true);
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "AbortError";
      setError(
        isTimeout
          ? "Server not responding. Run npm run dev in the project folder, then open http://localhost:43123."
          : e instanceof Error
            ? e.message
            : "Failed to start app"
      );
      setReady(false);
    }
  }, [loadSidebar]);

  useEffect(() => {
    init();
  }, [init]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      storeSessionId(id);
      setSessionId(id);
      // Show the whole conversation for the selected session, not just one
      // idea's thread, so nothing typed in this chat is hidden.
      setActiveIdeaId(undefined);
      setIdeaDetail(null);
      setRelatedIdeas([]);
      await loadSidebar();
    },
    [loadSidebar]
  );

  const handleSelectIdea = useCallback(
    async (ideaId: string) => {
      const res = await fetchWithTimeout(`/api/sessions?ideaId=${ideaId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.session?.id) {
        storeSessionId(data.session.id);
        setSessionId(data.session.id);
      }
      setActiveIdeaId(ideaId);
      setIdeaDetail(data.idea ?? null);
      await loadIdeaDetail(ideaId);
      await loadSidebar();
    },
    [loadIdeaDetail, loadSidebar]
  );

  const handleNewSession = useCallback(async () => {
    const res = await fetchWithTimeout("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New conversation" }),
    });
    if (!res.ok) return;
    const data = await res.json();
    storeSessionId(data.session.id);
    setSessionId(data.session.id);
    setActiveIdeaId(undefined);
    setIdeaDetail(null);
    setRelatedIdeas([]);
    await loadSidebar();
  }, [loadSidebar]);

  const handleClearIdea = useCallback(async () => {
    setActiveIdeaId(undefined);
    setIdeaDetail(null);
    setRelatedIdeas([]);
    if (sessionId) {
      await fetchWithTimeout("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, activeIdeaId: null }),
      });
    }
  }, [sessionId]);

  const handleIdeasUpdated = useCallback(async () => {
    await loadSidebar();
    if (activeIdeaId) await loadIdeaDetail(activeIdeaId);
  }, [loadSidebar, loadIdeaDetail, activeIdeaId]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-zinc-300">
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
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-400">
        <p>Loading Idea Forge...</p>
      </div>
    );
  }

  return (
    <main className="flex h-screen bg-zinc-950 text-zinc-100">
      <div className="hidden w-72 shrink-0 md:block lg:w-80">
        <IdeaSidebar
          groups={groups}
          sessions={sessions}
          activeIdeaId={activeIdeaId}
          activeSessionId={sessionId}
          ideaDetail={ideaDetail}
          relatedIdeas={relatedIdeas}
          onSelectIdea={handleSelectIdea}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onClearIdea={handleClearIdea}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ChatWindow
          key={`${sessionId}-${activeIdeaId ?? "all"}`}
          sessionId={sessionId}
          activeIdeaId={activeIdeaId}
          ideaTitle={ideaDetail?.title}
          agents={agents}
          cursorApiConfigured={cursorApiConfigured}
          onIdeasUpdated={handleIdeasUpdated}
          onSessionActivity={() => storeSessionId(sessionId)}
        />
      </div>
    </main>
  );
}
