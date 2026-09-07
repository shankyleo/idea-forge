"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, AlertCircle } from "lucide-react";
import type { AgentInfo, BmadAgentId, ChatMessage, DepthScore, HonestyBreakdown } from "@/lib/types";
import { AgentPicker } from "@/components/AgentPicker";
import { HonestyBreakdownCard } from "@/components/HonestyBreakdownCard";
import { DepthBadge } from "@/components/DepthBadge";
import { RelatedIdeas } from "@/components/IdeaSidebar";
import { getAgent } from "@/lib/bmad/agents";
import { isCasualMessage } from "@/lib/message-utils";

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
  const [agentId, setAgentId] = useState<BmadAgentId>("deep-recon");
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [lastDepth, setLastDepth] = useState<DepthScore | null>(null);
  const [lastRelated, setLastRelated] = useState<
    Array<{ id: string; title: string; score: number; reason: string }>
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/sessions?id=${sessionId}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
    if (data.session?.activeAgentId) setAgentId(data.session.activeAgentId);
  }, [sessionId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const finalizeAssistant = (
    assistantMsgId: string,
    assistantContent: string,
    doneReceived: boolean
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
          agentId,
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
    setResearching(agentId === "deep-recon" && !isCasualMessage(text));
    setStreamingContent("");
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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, agentId }),
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

          if (payload.type === "meta") {
            assistantMsgId = (payload.assistantMessageId as string) ?? "";
            setResearching(false);
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
                agentId,
                createdAt: new Date().toISOString(),
              },
            ]);
            setStreamingContent("");
            onIdeasUpdated();
          } else if (payload.type === "error") {
            throw new Error((payload.message as string) || "Stream error");
          }
        }
      }

      finalizeAssistant(assistantMsgId, assistantContent, doneReceived);
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
            ? "Request timed out. For Deep Recon, try a shorter message or switch to Forge. If using CURSOR_API_KEY, the agent may be slow — try again."
            : "Something went wrong. Make sure the dev server is running (`npm run dev`) and try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setResearching(false);
      setStreamingContent("");
    }
  };

  const activeAgent = getAgent(agentId);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-amber-400" />
              Idea Forge
            </h1>
            <p className="text-xs text-zinc-500">
              BMAD-powered thinking · Active: {activeAgent.name}
            </p>
          </div>
          {!cursorApiConfigured && (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
              <AlertCircle className="h-3.5 w-3.5" />
              Add CURSOR_API_KEY for live agents
            </div>
          )}
        </div>
        <div className="mt-3">
          <AgentPicker agents={agents} selected={agentId} onSelect={setAgentId} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !streamingContent && (
          <div className="mx-auto max-w-xl pt-12 text-center">
            <p className="text-zinc-400">
              Describe an app idea, business concept, or problem. BMAD agents will research,
              challenge, and connect it to your other ideas.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              Say hi to get started. Use Honesty Coach for claim breakdowns; Deep Recon for market depth.
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
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {getAgent(msg.agentId).name}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                {msg.role === "user" && msg.honestyBreakdown && (
                  <div className="mt-3 space-y-2">
                    <HonestyBreakdownCard breakdown={msg.honestyBreakdown} compact />
                    {msg.depthScore && <DepthBadge score={msg.depthScore} compact />}
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

          {streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-zinc-800/60 px-4 py-3 ring-1 ring-zinc-700/50">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {activeAgent.name}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{streamingContent}</p>
              </div>
            </div>
          )}

          {researching && (
            <div className="flex justify-center">
              <p className="animate-pulse text-sm text-blue-400">
                Deep Recon searching the web for market signals...
              </p>
            </div>
          )}

          {lastDepth && loading && !researching && (
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
            placeholder={
              agentId === "deep-recon"
                ? "Describe your idea — Deep Recon will search the market and score its depth..."
                : `Ask ${activeAgent.name} to brainstorm, attack, or defend an idea...`
            }
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
