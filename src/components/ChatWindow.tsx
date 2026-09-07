"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, AlertCircle, Wand2 } from "lucide-react";
import type { AgentInfo, BmadAgentId, ChatMessage, DepthScore, HonestyBreakdown } from "@/lib/types";
import { HonestyBreakdownCard } from "@/components/HonestyBreakdownCard";
import { DepthBadge } from "@/components/DepthBadge";
import { RelatedIdeas } from "@/components/IdeaSidebar";
import { getAgent } from "@/lib/bmad/agents";

const CHAT_TIMEOUT_MS = 90_000;

interface ChatWindowProps {
  sessionId: string;
  agents: AgentInfo[];
  cursorApiConfigured: boolean;
  onIdeasUpdated: () => void;
}

export function ChatWindow({
  sessionId,
  agents,
  cursorApiConfigured,
  onIdeasUpdated,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<{
    agentId: BmadAgentId;
    reason: string;
  } | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingAgentId, setStreamingAgentId] = useState<BmadAgentId | null>(null);
  const [lastDepth, setLastDepth] = useState<DepthScore | null>(null);
  const [lastRelated, setLastRelated] = useState<
    Array<{ id: string; title: string; score: number; reason: string }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/sessions?id=${sessionId}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, [sessionId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, statusLine]);

  const finalizeAssistant = (
    assistantMsgId: string,
    assistantContent: string,
    doneReceived: boolean,
    route?: { agentId: BmadAgentId; reason: string }
  ) => {
    const content = assistantContent.trim();
    if (!doneReceived && content) {
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId || `a-${Date.now()}`,
          sessionId,
          role: "assistant",
          content,
          agentId: route?.agentId,
          routeReason: route?.reason,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamingContent("");
      onIdeasUpdated();
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setStatusLine("Choosing the best agent for your message...");
    setActiveRoute(null);
    setStreamingContent("");
    setStreamingAgentId(null);
    setLastDepth(null);
    setLastRelated([]);

    const optimisticUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    let routedAgent: BmadAgentId | null = null;
    let routeReason = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Chat request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let metaApplied = false;
      let assistantMsgId = "";
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6)) as Record<string, unknown>;

          if (payload.type === "routing") {
            routedAgent = payload.agentId as BmadAgentId;
            routeReason = (payload.routeReason as string) ?? "";
            setActiveRoute({ agentId: routedAgent, reason: routeReason });
            setStreamingAgentId(routedAgent);
            setStatusLine(
              routedAgent === "party-mode"
                ? "Party Mode — multiple agents weighing in..."
                : `${getAgent(routedAgent).name} is responding...`
            );
          } else if (payload.type === "status") {
            setStatusLine(payload.message as string);
          } else if (payload.type === "meta") {
            assistantMsgId = (payload.assistantMessageId as string) ?? "";
            setStatusLine(null);
            if (!metaApplied) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimisticUser.id
                    ? {
                        ...m,
                        honestyBreakdown: payload.honestyBreakdown as HonestyBreakdown | undefined,
                        depthScore: payload.depthScore as DepthScore | undefined,
                        relatedIdeas: payload.relatedIdeas as ChatMessage["relatedIdeas"],
                        ideaId: payload.ideaId as string | undefined,
                      }
                    : m
                )
              );
              if (payload.depthScore) setLastDepth(payload.depthScore as DepthScore);
              setLastRelated((payload.relatedIdeas as typeof lastRelated) ?? []);
              metaApplied = true;
            }
          } else if (payload.type === "chunk") {
            assistantContent += payload.content as string;
            setStreamingContent(assistantContent);
          } else if (payload.type === "done") {
            doneReceived = true;
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMsgId || `a-${Date.now()}`,
                sessionId,
                role: "assistant",
                content: assistantContent.trim(),
                agentId: routedAgent ?? undefined,
                routeReason: routeReason || undefined,
                createdAt: new Date().toISOString(),
              },
            ]);
            setStreamingContent("");
            setStreamingAgentId(null);
            onIdeasUpdated();
          } else if (payload.type === "error") {
            throw new Error((payload.message as string) || "Stream error");
          }
        }
      }

      finalizeAssistant(
        assistantMsgId,
        assistantContent,
        doneReceived,
        routedAgent ? { agentId: routedAgent, reason: routeReason } : undefined
      );
    } catch (error) {
      console.error(error);
      const isTimeout = error instanceof Error && error.name === "AbortError";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sessionId,
          role: "assistant",
          content: isTimeout
            ? "Request timed out. Try a shorter message or check CURSOR_API_KEY if using live agents."
            : "Something went wrong. Make sure the dev server is running (`npm run dev`) and try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setStatusLine(null);
      setActiveRoute(null);
      setStreamingContent("");
      setStreamingAgentId(null);
    }
  };

  const routedAgentInfo = activeRoute ? getAgent(activeRoute.agentId) : null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Idea Forge
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Wand2 className="h-3 w-3" />
              Auto-routing · {agents.length} BMAD agents on call
            </p>
          </div>
          {!cursorApiConfigured && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              <AlertCircle className="h-3.5 w-3.5" />
              Add CURSOR_API_KEY for live agents
            </div>
          )}
        </div>
        {activeRoute && routedAgentInfo && (
          <div
            className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: `${routedAgentInfo.color}55`, color: routedAgentInfo.color }}
          >
            <span className="font-semibold">{routedAgentInfo.name}</span>
            <span className="text-zinc-500">· {activeRoute.reason}</span>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamingContent && (
          <div className="mx-auto max-w-xl pt-12 text-center">
            <p className="text-zinc-400">
              Just type — Idea Forge picks the right BMAD agent for what you say: new ideas,
              pushback, research, honesty checks, brainstorming, and more.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              No agent picker needed. Describe an idea, react to feedback, or ask what&apos;s missing.
            </p>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600/20 text-indigo-50 ring-1 ring-indigo-500/20"
                    : "bg-zinc-800/60 text-zinc-100 ring-1 ring-zinc-700/50"
                }`}
              >
                {msg.role === "assistant" && msg.agentId && (
                  <div className="mb-1 space-y-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {getAgent(msg.agentId).name}
                    </div>
                    {msg.routeReason && (
                      <div className="text-[10px] text-zinc-600">{msg.routeReason}</div>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.role === "user" && msg.honestyBreakdown && (
                  <div className="mt-3 space-y-2">
                    <HonestyBreakdownCard breakdown={msg.honestyBreakdown} compact />
                    {msg.depthScore && <DepthBadge score={msg.depthScore} compact />}
                  </div>
                )}
                {msg.role === "user" && !msg.honestyBreakdown && msg.depthScore && (
                  <div className="mt-3">
                    <DepthBadge score={msg.depthScore} compact />
                  </div>
                )}
                {msg.relatedIdeas && msg.relatedIdeas.length > 0 && (
                  <div className="mt-2">
                    <RelatedIdeas related={msg.relatedIdeas} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {streamingContent && streamingAgentId && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-zinc-800/60 px-4 py-3 ring-1 ring-zinc-700/50">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {getAgent(streamingAgentId).name}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</p>
              </div>
            </div>
          )}

          {statusLine && (
            <div className="flex justify-center">
              <p className="animate-pulse text-sm text-indigo-300">{statusLine}</p>
            </div>
          )}

          {lastDepth && loading && !statusLine?.includes("searching") && (
            <div className="mx-auto max-w-md space-y-2">
              <DepthBadge score={lastDepth} />
              {lastRelated.length > 0 && <RelatedIdeas related={lastRelated} />}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-zinc-800 p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type anything — an idea, feedback, a question, pushback on what you heard..."
            rows={2}
            className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            disabled={loading}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="flex h-auto items-center justify-center rounded-xl bg-indigo-600 px-4 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
