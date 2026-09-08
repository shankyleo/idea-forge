"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentInfo, ChatSession, IdeaGraph, IdeaGroup, IdeaRecord, IdeaThought } from "@/lib/types";
import {
  IdeaSidebar,
  getStoredSessionId,
  storeSessionId,
  type SidebarTab,
} from "@/components/IdeaSidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { IdeaMap } from "@/components/IdeaMap";
import { cn } from "@/lib/utils";

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
  const [tab, setTab] = useState<SidebarTab>("chat");
  const [graph, setGraph] = useState<IdeaGraph>({ nodes: [], edges: [] });
  const [thoughts, setThoughts] = useState<IdeaThought[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const openNav = useCallback(() => {
    setMobileNavOpen(true);
    setDesktopNavCollapsed(false);
  }, []);
  const collapseNav = useCallback(() => {
    setMobileNavOpen(false);
    setDesktopNavCollapsed(true);
  }, []);

  const loadGraph = useCallback(async () => {
    const res = await fetchWithTimeout("/api/ideas?graph=1");
    if (!res.ok) return;
    const data = await res.json();
    setGraph({ nodes: data.nodes ?? [], edges: data.edges ?? [] });
    setThoughts(data.thoughts ?? []);
  }, []);

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

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileNav();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen, closeMobileNav]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) closeMobileNav();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [closeMobileNav]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      storeSessionId(id);
      setSessionId(id);
      closeMobileNav();
      // Show the whole conversation for the selected session, not just one
      // idea's thread, so nothing typed in this chat is hidden.
      setActiveIdeaId(undefined);
      setIdeaDetail(null);
      setRelatedIdeas([]);
      await loadSidebar();
    },
    [loadSidebar, closeMobileNav]
  );

  const handleTabChange = useCallback(
    (next: SidebarTab) => {
      setTab(next);
      if (next === "idea") {
        void loadGraph();
        closeMobileNav();
      }
    },
    [loadGraph, closeMobileNav]
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
      setTab("chat");
      closeMobileNav();
      await loadSidebar();
    },
    [loadSidebar, closeMobileNav]
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
    closeMobileNav();
    await loadSidebar();
  }, [loadSidebar, closeMobileNav]);

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
    if (tab === "idea") await loadGraph();
  }, [loadSidebar, loadIdeaDetail, activeIdeaId, tab, loadGraph]);

  const handleRenameSession = useCallback(
    async (id: string, title: string) => {
      await fetchWithTimeout("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title }),
      });
      await loadSidebar();
    },
    [loadSidebar]
  );

  const handleTogglePinIdea = useCallback(
    async (id: string, pinned: boolean) => {
      await fetchWithTimeout("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned }),
      });
      await loadSidebar();
    },
    [loadSidebar]
  );

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
    <main className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Dismiss conversation menu"
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeMobileNav}
        />
      )}
      <div
        id="app-nav"
        className={cn(
          "z-40 h-full w-[min(18rem,88vw)] shrink-0 lg:w-80",
          mobileNavOpen
            ? "fixed inset-y-0 left-0 flex h-dvh pb-[env(safe-area-inset-bottom)]"
            : "hidden",
          desktopNavCollapsed ? "md:hidden" : "md:static md:flex md:w-72"
        )}
      >
        <div className="h-full w-full">
          <IdeaSidebar
            tab={tab}
            onTabChange={handleTabChange}
            groups={groups}
            sessions={sessions}
            linkCount={graph.edges.length}
            activeIdeaId={activeIdeaId}
            activeSessionId={sessionId}
            ideaDetail={ideaDetail}
            relatedIdeas={relatedIdeas}
            onSelectIdea={handleSelectIdea}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onClearIdea={handleClearIdea}
            onRenameSession={handleRenameSession}
            onTogglePinIdea={handleTogglePinIdea}
            onCloseMobile={collapseNav}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1" inert={mobileNavOpen ? true : undefined}>
        {tab === "idea" ? (
          <IdeaMap
            graph={graph}
            thoughts={thoughts}
            onSelectIdea={handleSelectIdea}
            onOpenSidebar={openNav}
            sidebarOpen={mobileNavOpen || !desktopNavCollapsed}
            showSidebarToggleOnDesktop={desktopNavCollapsed}
          />
        ) : (
          <ChatWindow
            key={sessionId}
            sessionId={sessionId}
            agents={agents}
            cursorApiConfigured={cursorApiConfigured}
            onIdeasUpdated={handleIdeasUpdated}
            onSessionActivity={() => storeSessionId(sessionId)}
            onSessionUpdated={loadSidebar}
            onContinueSimilarChat={handleSelectSession}
            onOpenSidebar={openNav}
            sidebarOpen={mobileNavOpen || !desktopNavCollapsed}
            showSidebarToggleOnDesktop={desktopNavCollapsed}
          />
        )}
      </div>
    </main>
  );
}
