"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, AlertCircle, Wand2 } from "lucide-react";
import type { AgentInfo, BmadAgentId, ChatMessage, DepthScore, HonestyBreakdown, SimilarIdeaNudge } from "@/lib/types";
import { HonestyBreakdownCard } from "@/components/HonestyBreakdownCard";
import { DepthBadge } from "@/components/DepthBadge";
import { RelatedIdeas } from "@/components/IdeaSidebar";
import { getAgent } from "@/lib/bmad/agents";
import { AgentIcon } from "@/components/AgentIcon";
import { isCasualMessage } from "@/lib/message-utils";
import { scoreHonesty } from "@/lib/honesty-scorer";
import { SLASH_COMMAND_HINTS, filterSlashCommandOptions, getSlashPickerQuery, parseSlashCommand, shouldShowTurnHonesty } from "@/lib/slash-commands";
import { SlashCommandPicker } from "@/components/SlashCommandPicker";
import { AgentReplyHeader } from "@/components/AgentReplyHeader";
import {
  MarkdownContent,
  PerspectiveCards,
  ForgeActionBar,
} from "@/components/AssistantMessage";
import type { AgentPerspective } from "@/lib/types";

const CHAT_TIMEOUT_MS = 90_000;

type ChatTurn = { user: ChatMessage; assistant?: ChatMessage };

function groupIntoTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "user") {
      const next = messages[i + 1];
      const assistant = next?.role === "assistant" ? next : undefined;
      turns.push({ user: msg, assistant });
      i += assistant ? 2 : 1;
    } else {
      turns.push({
        user: {
          id: `orphan-${msg.id}`,
          sessionId: msg.sessionId,
          role: "user",
          content: "",
          createdAt: msg.createdAt,
        },
        assistant: msg,
      });
      i += 1;
    }
  }
  return turns;
}

function groundingForTurn(
  turn: ChatTurn,
  ideaHonesty: HonestyBreakdown | null,
  isLastTurn: boolean,
  livePanel?: AgentPerspective[] | null
): HonestyBreakdown | undefined {
  const slash = turn.user.content ? parseSlashCommand(turn.user.content.trim()) : null;
  const showHonesty = !slash || shouldShowTurnHonesty(slash, isCasualMessage(turn.user.content));

  if (!showHonesty) return undefined;
  if (turn.user.honestyBreakdown) return turn.user.honestyBreakdown;
  if (isLastTurn && ideaHonesty && !slash) return ideaHonesty;
  if (!turn.user.content || isCasualMessage(turn.user.content)) return undefined;
  if (slash) return undefined;

  const perspectives = turn.assistant?.perspectives ?? livePanel ?? [];
  const panelText = perspectives.map((p) => p.content).join("\n");
  const combined = [turn.user.content, panelText].filter(Boolean).join("\n\n");
  return scoreHonesty(combined, {
    hasResearch: Boolean(turn.assistant?.depthScore ?? livePanel?.length),
    depthScore: turn.assistant?.depthScore?.overall,
    competitionLevel: turn.assistant?.depthScore?.competitionLevel,
  });
}

function AssistantBubble({
  msg,
  loading,
  onSend,
  onContinueSimilarChat,
  invokedViaSlash,
  slashCommand,
}: {
  msg: ChatMessage;
  loading: boolean;
  onSend: (text: string) => void;
  onContinueSimilarChat?: (sessionId: string) => void;
  invokedViaSlash?: boolean;
  slashCommand?: string;
}) {
  return (
    <div className="w-full rounded-2xl bg-zinc-800/60 px-4 py-3 ring-1 ring-zinc-700/50">
      {msg.agentId && (
        <AgentReplyHeader
          agentId={msg.agentId}
          routeReason={msg.routeReason}
          invokedViaSlash={invokedViaSlash}
          slashCommand={slashCommand}
        />
      )}
      <MarkdownContent content={msg.content} />
      {msg.depthScore && (
        <div className="mt-3">
          <DepthBadge score={msg.depthScore} />
        </div>
      )}
      {msg.showForgeActions && (
        <ForgeActionBar disabled={loading} onAction={onSend} />
      )}
      {msg.relatedIdeas && msg.relatedIdeas.length > 0 && (
        <div className="mt-2">
          <RelatedIdeas
            related={msg.relatedIdeas}
            onContinue={(id) => {
              void fetch(`/api/sessions?ideaId=${id}`)
                .then((r) => r.json())
                .then((d) => {
                  if (d.session?.id) onContinueSimilarChat?.(d.session.id);
                });
            }}
          />
        </div>
      )}
    </div>
  );
}

interface ChatWindowProps {
  sessionId: string;
  agents: AgentInfo[];
  cursorApiConfigured: boolean;
  onIdeasUpdated: () => void;
  onSessionActivity?: () => void;
  onContinueSimilarChat?: (sessionId: string) => void;
}

export function ChatWindow({
  sessionId,
  agents,
  cursorApiConfigured,
  onIdeasUpdated,
  onSessionActivity,
  onContinueSimilarChat,
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
  const [streamingPerspectives, setStreamingPerspectives] = useState<AgentPerspective[]>([]);
  const [streamingForgeActions, setStreamingForgeActions] = useState(false);
  const [lastDepth, setLastDepth] = useState<DepthScore | null>(null);
  const [lastRelated, setLastRelated] = useState<
    Array<{ id: string; title: string; score: number; reason: string }>
  >([]);
  const [similarNudge, setSimilarNudge] = useState<SimilarIdeaNudge | null>(null);
  const [ideaHonesty, setIdeaHonesty] = useState<HonestyBreakdown | null>(null);
  const [ideaHonestyDelta, setIdeaHonestyDelta] = useState<number | undefined>();
  const [panelPerspectives, setPanelPerspectives] = useState<AgentPerspective[]>([]);
  const [slashPickerIndex, setSlashPickerIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const slashQuery = getSlashPickerQuery(input);
  const slashOptions = slashQuery !== null ? filterSlashCommandOptions(slashQuery) : [];
  const slashPickerOpen = slashQuery !== null;

  useEffect(() => {
    setSlashPickerIndex(0);
  }, [slashQuery]);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/sessions?id=${sessionId}`);
    const data = await res.json();
    setMessages(data.messages ?? []);
    if (data.ideaHonesty) {
      setIdeaHonesty(data.ideaHonesty as HonestyBreakdown);
    }
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
      onSessionActivity?.();
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;

    if (!overrideText) setInput("");
    setLoading(true);
    setStatusLine("Choosing the best agent for your message...");
    setActiveRoute(null);
    setStreamingContent("");
    setStreamingAgentId(null);
    setStreamingPerspectives([]);
    setStreamingForgeActions(false);
    setLastDepth(null);
    setLastRelated([]);
    setSimilarNudge(null);
    setPanelPerspectives([]);

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
    let responsePerspectives: AgentPerspective[] = [];
    let responseForgeActions = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: text,
        }),
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
          } else if (payload.type === "perspectives") {
            const p = payload.perspectives as AgentPerspective[];
            responsePerspectives = p;
            setPanelPerspectives(p);
            setStreamingPerspectives(p);
          } else if (payload.type === "meta") {
            assistantMsgId = (payload.assistantMessageId as string) ?? "";
            const userMessageId = (payload.userMessageId as string) ?? optimisticUser.id;
            setStatusLine(null);
            if (!metaApplied) {
              const grounding = payload.honestyBreakdown as HonestyBreakdown | undefined;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimisticUser.id
                    ? {
                        ...m,
                        id: userMessageId,
                        honestyBreakdown: grounding,
                        depthScore: payload.depthScore as DepthScore | undefined,
                        relatedIdeas: payload.relatedIdeas as ChatMessage["relatedIdeas"],
                        ideaId: payload.ideaId as string | undefined,
                      }
                    : m
                )
              );
              if (payload.depthScore) setLastDepth(payload.depthScore as DepthScore);
              setLastRelated((payload.relatedIdeas as typeof lastRelated) ?? []);
              if (payload.similarIdeaNudge) {
                setSimilarNudge(payload.similarIdeaNudge as SimilarIdeaNudge);
              }
              if (grounding) {
                setIdeaHonesty(grounding);
              } else if (payload.ideaHonesty) {
                setIdeaHonesty(payload.ideaHonesty as HonestyBreakdown);
              }
              if (typeof payload.ideaHonestyDelta === "number") {
                setIdeaHonestyDelta(payload.ideaHonestyDelta as number);
              }
              if (payload.perspectives && !responsePerspectives.length) {
                responsePerspectives = payload.perspectives as AgentPerspective[];
                setStreamingPerspectives(responsePerspectives);
              }
              if (payload.showForgeActions) {
                responseForgeActions = true;
                setStreamingForgeActions(true);
              }
              metaApplied = true;
            }
          } else if (payload.type === "chunk") {
            assistantContent += payload.content as string;
            setStreamingContent(assistantContent);
          } else if (payload.type === "done") {
            doneReceived = true;
            const finalGrounding = payload.honestyBreakdown as HonestyBreakdown | undefined;
            const doneUserId = payload.userMessageId as string | undefined;
            if (payload.ideaHonesty) {
              setIdeaHonesty(payload.ideaHonesty as HonestyBreakdown);
            }
            if (finalGrounding && doneUserId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === doneUserId ? { ...m, honestyBreakdown: finalGrounding } : m
                )
              );
            }
            setIdeaHonestyDelta(undefined);
            setMessages((prev) => [
              ...prev,
              {
                id: assistantMsgId || `a-${Date.now()}`,
                sessionId,
                role: "assistant",
                content: assistantContent.trim(),
                agentId: routedAgent ?? undefined,
                routeReason: routeReason || undefined,
                perspectives: responsePerspectives,
                showForgeActions: responseForgeActions,
                depthScore: (payload.depthScore as DepthScore) ?? undefined,
                createdAt: new Date().toISOString(),
              },
            ]);
            setStreamingContent("");
            setStreamingAgentId(null);
            setStreamingPerspectives([]);
            setPanelPerspectives([]);
            setStreamingForgeActions(false);
            onIdeasUpdated();
            onSessionActivity?.();
            void loadMessages();
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
      setPanelPerspectives([]);
    }
  };

  const routedAgentInfo = activeRoute ? getAgent(activeRoute.agentId) : null;
  const turns = groupIntoTurns(messages);

  const selectSlashCommand = useCallback((command: string) => {
    setInput(`${command} `);
    setSlashPickerIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const len = command.length + 1;
      inputRef.current?.setSelectionRange(len, len);
    });
  }, []);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashPickerOpen && slashOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashPickerIndex((i) => (i + 1) % slashOptions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashPickerIndex((i) => (i - 1 + slashOptions.length) % slashOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectSlashCommand(slashOptions[Math.min(slashPickerIndex, slashOptions.length - 1)].label);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setInput("");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

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
          <div className="mt-3">
            {activeRoute.reason.startsWith("You invoked /") ? (
              <AgentReplyHeader
                agentId={activeRoute.agentId}
                routeReason={activeRoute.reason}
                invokedViaSlash
              />
            ) : (
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                style={{ borderColor: `${routedAgentInfo.color}55`, color: routedAgentInfo.color }}
              >
                <AgentIcon agentId={routedAgentInfo.id} className="h-5 w-5" color={routedAgentInfo.color} />
                <span className="font-semibold">{routedAgentInfo.name}</span>
                <span className="text-zinc-500">· {activeRoute.reason}</span>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {similarNudge && (
          <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
            <p>
              This sounds like an idea you explored before:{" "}
              <strong>{similarNudge.title}</strong>.
            </p>
            <button
              type="button"
              onClick={() => {
                onContinueSimilarChat?.(similarNudge.sessionId);
                setSimilarNudge(null);
              }}
              className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Continue that chat
            </button>
          </div>
        )}
        {messages.length === 0 && !streamingContent && (
          <div className="mx-auto max-w-xl pt-12 text-center">
            <p className="text-zinc-400">
              Just type — Idea Forge picks the right BMAD agent for what you say: new ideas,
              pushback, research, honesty checks, brainstorming, and more.
            </p>
            <p className="mt-2 text-xs text-zinc-600">
              No agent picker needed. Describe an idea, react to feedback, or ask what&apos;s missing.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Type normally for the full team flow — {getAgent("forge").name},{" "}
              {getAgent("red-team").name}, {getAgent("innovation").name}, and{" "}
              {getAgent("design-thinking").name} weigh in as a panel, then a lead reply. Type{" "}
              <span className="text-zinc-400">/</span> to talk to one agent directly:
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {SLASH_COMMAND_HINTS.map(({ command, agentId }) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => selectSlashCommand(command)}
                  className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                >
                  {command}
                  <span className="ml-1 text-zinc-600">→ {getAgent(agentId).name}</span>
                </button>
              ))}
            </div>
            {agents.length > 0 && (
              <div className="mt-8 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
                {agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                  >
                    <AgentIcon agentId={agent.id} className="h-9 w-9 shrink-0" color={agent.color} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">{agent.name}</p>
                      <p className="truncate text-[10px] text-zinc-500">{agent.persona}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-8">
          {turns.map((turn, turnIndex) => {
            const isLastTurn = turnIndex === turns.length - 1;
            const isLiveTurn = isLastTurn && loading;
            const slash = turn.user.content
              ? parseSlashCommand(turn.user.content.trim())
              : null;
            const showPanel = !slash || slash.agentId === "party-mode";
            const livePerspectives =
              showPanel &&
              isLiveTurn &&
              (streamingPerspectives.length > 0 || panelPerspectives.length > 0)
                ? streamingPerspectives.length > 0
                  ? streamingPerspectives
                  : panelPerspectives
                : null;
            const grounding = groundingForTurn(
              turn,
              ideaHonesty,
              isLastTurn,
              livePerspectives
            );
            const groundingVariant =
              turn.assistant?.agentId === "honesty-coach" ? "coach" : "grounding";

            if (!turn.user.content && turn.assistant) {
              return (
                <div key={turn.assistant.id}>
                  <AssistantBubble
                    msg={turn.assistant}
                    loading={loading}
                    onSend={(t) => void sendMessage(t)}
                    onContinueSimilarChat={onContinueSimilarChat}
                  />
                </div>
              );
            }

            return (
              <article key={turn.user.id} className="space-y-3">
                {turn.user.content && (
                  <div className="flex justify-end">
                    <div className="max-w-lg rounded-2xl bg-indigo-600/20 px-4 py-3 text-indigo-50 ring-1 ring-indigo-500/20">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.user.content}</p>
                    </div>
                  </div>
                )}

                {(showPanel && (turn.assistant?.perspectives ?? livePerspectives)?.length) ? (
                  <PerspectiveCards
                    perspectives={(turn.assistant?.perspectives ?? livePerspectives)!}
                  />
                ) : null}

                {grounding && (
                  <HonestyBreakdownCard
                    breakdown={grounding}
                    variant={groundingVariant}
                    defaultExpanded
                    delta={isLiveTurn ? ideaHonestyDelta : undefined}
                  />
                )}

                {turn.assistant && (
                  <AssistantBubble
                    msg={turn.assistant}
                    loading={loading}
                    onSend={(t) => void sendMessage(t)}
                    onContinueSimilarChat={onContinueSimilarChat}
                    invokedViaSlash={Boolean(slash)}
                    slashCommand={slash?.command}
                  />
                )}

                {isLiveTurn && streamingContent && streamingAgentId && (
                  <div className="w-full rounded-2xl bg-zinc-800/60 px-4 py-3 ring-1 ring-zinc-700/50">
                    <AgentReplyHeader
                      agentId={streamingAgentId}
                      routeReason={activeRoute?.reason}
                      invokedViaSlash={Boolean(slash)}
                      slashCommand={slash?.command}
                    />
                    <MarkdownContent content={streamingContent} />
                    {streamingForgeActions && (
                      <ForgeActionBar disabled={loading} onAction={(t) => void sendMessage(t)} />
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {statusLine && (
            <div className="flex justify-center">
              <p className="animate-pulse text-sm text-indigo-300">{statusLine}</p>
            </div>
          )}

          {lastDepth && loading && !statusLine?.includes("searching") && (
            <div className="space-y-2">
              <DepthBadge score={lastDepth} />
              {lastRelated.length > 0 && <RelatedIdeas related={lastRelated} />}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-zinc-800 p-4">
        <div className="relative mx-auto max-w-3xl">
          {slashPickerOpen && (
            <SlashCommandPicker
              options={slashOptions}
              selectedIndex={slashPickerIndex}
              onSelect={(option) => selectSlashCommand(option.label)}
              onHighlight={setSlashPickerIndex}
            />
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Type / to pick an agent, or describe your idea…"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="flex h-auto items-center justify-center rounded-xl bg-indigo-600 px-4 text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
