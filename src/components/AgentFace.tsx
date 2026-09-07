"use client";

import type { BmadAgentId } from "@/lib/types";
import { getAgent } from "@/lib/bmad/agents";
import { cn } from "@/lib/utils";

const FACE_ANIM: Record<BmadAgentId, string> = {
  "honesty-coach": "agent-face--honesty",
  "deep-recon": "agent-face--recon",
  forge: "agent-face--forge",
  brainstorm: "agent-face--brainstorm",
  "red-team": "agent-face--reviewer",
  "design-thinking": "agent-face--maya",
  innovation: "agent-face--victor",
  "problem-solving": "agent-face--quinn",
  "party-mode": "agent-face--party",
};

interface AgentFaceProps {
  agentId: BmadAgentId;
  className?: string;
  color?: string;
  animate?: boolean;
}

export function AgentFace({ agentId, className, color, animate = true }: AgentFaceProps) {
  const agent = getAgent(agentId);
  const stroke = color ?? agent.color;

  return (
    <span
      className={cn(
        "agent-face inline-flex shrink-0",
        animate && FACE_ANIM[agentId],
        className
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-full w-full overflow-visible">
        <Face agentId={agentId} color={stroke} />
      </svg>
    </span>
  );
}

function Face({ agentId, color }: { agentId: BmadAgentId; color: string }) {
  switch (agentId) {
    case "honesty-coach":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <rect x="8" y="12" width="16" height="5" rx="2.5" fill="none" stroke={color} strokeWidth="1.2" className="agent-glasses" />
          <circle cx="11.5" cy="14.5" r="1.2" fill={color} className="agent-eye-left" />
          <circle cx="20.5" cy="14.5" r="1.2" fill={color} className="agent-eye-right" />
          <path d="M12 21 Q16 23 20 21" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </>
      );
    case "deep-recon":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <circle cx="11" cy="14" r="3" fill="none" stroke={color} strokeWidth="1.2" className="agent-lens-left" />
          <circle cx="21" cy="14" r="3" fill="none" stroke={color} strokeWidth="1.2" className="agent-lens-right" />
          <circle cx="11" cy="14" r="1" fill={color} className="agent-pupil-left" />
          <circle cx="21" cy="14" r="1" fill={color} className="agent-pupil-right" />
          <path d="M14 14h4" stroke={color} strokeWidth="1" />
          <path d="M13 21h6" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </>
      );
    case "forge":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <path d="M9 11 L13 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="agent-brow-left" />
          <path d="M23 11 L19 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="agent-brow-right" />
          <circle cx="11.5" cy="15" r="1.3" fill={color} />
          <circle cx="20.5" cy="15" r="1.3" fill={color} />
          <path d="M12 21 Q16 19 20 21" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </>
      );
    case "brainstorm":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <circle cx="11.5" cy="14" r="1.4" fill={color} className="agent-eye-left" />
          <circle cx="20.5" cy="14" r="1.4" fill={color} className="agent-eye-right" />
          <path d="M10 19 Q16 24 22 19" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="agent-smile" />
          <path d="M16 3 L16 7 M22 5 L20 8 M10 5 L12 8" stroke={color} strokeWidth="1.2" strokeLinecap="round" className="agent-spark" />
        </>
      );
    case "red-team":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <path d="M9 12 L14 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M23 11 L18 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" className="agent-brow-raise" />
          <circle cx="11.5" cy="15.5" r="1.2" fill={color} />
          <ellipse cx="20.5" cy="15.5" rx="1.4" ry="1" fill={color} />
          <path d="M13 21 L19 21" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
        </>
      );
    case "design-thinking":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <path d="M9 13 Q11 11 13 13" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M19 13 Q21 11 23 13" fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="11.5" cy="15" r="1.3" fill={color} className="agent-eye-left" />
          <circle cx="20.5" cy="15" r="1.3" fill={color} className="agent-eye-right" />
          <path d="M11 20 Q16 23 21 20" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" className="agent-smile" />
          <path d="M16 24 C14 26 12 25 12 23" fill={color} opacity="0.5" className="agent-blush" />
        </>
      );
    case "innovation":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <circle cx="11.5" cy="14.5" r="1.2" fill={color} />
          <circle cx="20.5" cy="14.5" r="1.2" fill={color} />
          <path d="M12 19 Q16 22 21 18" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" className="agent-smirk" />
          <path d="M16 4 L18 8 L14 8 Z" fill={color} className="agent-crown" />
        </>
      );
    case "problem-solving":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <circle cx="11.5" cy="14" r="1.3" fill={color} className="agent-eye-left" />
          <circle cx="20.5" cy="14" r="1.3" fill={color} className="agent-eye-right" />
          <path d="M13 20 Q16 18 19 20" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="24" cy="10" r="2.5" fill="none" stroke={color} strokeWidth="1" className="agent-thought" />
          <circle cx="26.5" cy="6.5" r="1.5" fill="none" stroke={color} strokeWidth="0.8" className="agent-thought" />
        </>
      );
    case "party-mode":
      return (
        <>
          <circle cx="16" cy="16" r="13" fill="#18181b" stroke={color} strokeWidth="1.5" />
          <circle cx="10" cy="14" r="1.1" fill={color} className="agent-eye-left" />
          <circle cx="16" cy="13" r="1.1" fill={color} />
          <circle cx="22" cy="14" r="1.1" fill={color} className="agent-eye-right" />
          <path d="M9 20 Q13 23 16 20 Q19 23 23 20" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" className="agent-smile" />
          <path d="M8 8 L10 11 M24 8 L22 11" stroke={color} strokeWidth="1.2" strokeLinecap="round" className="agent-confetti" />
          <circle cx="16" cy="6" r="1" fill={color} className="agent-confetti" />
        </>
      );
  }
}
