import type { HonestyBreakdown } from "@/lib/types";

function extractTextFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;
  const e = event as Record<string, unknown>;

  if (e.type === "assistant" && e.message && typeof e.message === "object") {
    const message = e.message as { content?: Array<{ type?: string; text?: string }> };
    const text = message.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (text) return text;
  }

  if (e.type === "assistant" && typeof e.text === "string") return e.text;
  if (e.type === "text-delta" && typeof e.delta === "string") return e.delta;
  if (e.type === "content_block_delta") {
    const delta = e.delta as Record<string, unknown> | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text;
    }
  }

  if (typeof e.content === "string") return e.content;

  return null;
}

export function parseHonestyBreakdown(text: string): HonestyBreakdown | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenceMatch?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.trim()) as {
        honestyBreakdown?: HonestyBreakdown;
      };
      if (parsed.honestyBreakdown?.dimensions?.length) {
        return normalizeBreakdown(parsed.honestyBreakdown);
      }
    } catch {
      const inline = candidate.match(/\{[\s\S]*"honestyBreakdown"[\s\S]*\}/);
      if (inline) {
        try {
          const parsed = JSON.parse(inline[0]) as { honestyBreakdown?: HonestyBreakdown };
          if (parsed.honestyBreakdown?.dimensions?.length) {
            return normalizeBreakdown(parsed.honestyBreakdown);
          }
        } catch {
          /* try next */
        }
      }
    }
  }
  return null;
}

function normalizeBreakdown(raw: HonestyBreakdown): HonestyBreakdown {
  return {
    dimensions: raw.dimensions.map((d) => ({
      id: d.id,
      label: d.label,
      score: Math.max(0, Math.min(100, Math.round(d.score))),
      note: d.note?.trim() ?? "",
    })),
    flags: raw.flags ?? [],
    summary: raw.summary?.trim() ?? "",
  };
}

export function stripHonestyJsonBlock(text: string): string {
  return text.replace(/```(?:json)?\s*\{[\s\S]*?honestyBreakdown[\s\S]*?\}\s*```/gi, "").trim();
}

export async function runHonestyBreakdown(message: string): Promise<{
  breakdown: HonestyBreakdown | null;
  narrative: string;
}> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return {
      breakdown: null,
      narrative:
        "Honesty analysis requires **CURSOR_API_KEY** in `.env.local`. The Honesty Coach uses a live BMAD agent — not rule-based scoring — to evaluate your claims across six dimensions.",
    };
  }

  try {
    const { Agent } = await import("@cursor/sdk");
    const fs = await import("fs");
    const path = await import("path");
    const skillPath = path.join(process.cwd(), ".agents/skills/bmad-honesty-coach/SKILL.md");
    const skill = fs.readFileSync(skillPath, "utf-8");

    const agent = await Agent.create({
      apiKey,
      model: { id: "composer-2.5" },
      local: { cwd: process.cwd() },
    });

    const prompt = `${skill}

---

Evaluate this user message as an idea or set of claims:

"""
${message}
"""

Follow the skill exactly. Emit the JSON block first, then your short follow-up.`;

    const run = await agent.send(prompt);
    let full = "";
    const deadline = Date.now() + 60_000;

    for await (const event of run.stream()) {
      if (Date.now() > deadline) break;
      const text = extractTextFromEvent(event);
      if (text) full += text;
    }

    const breakdown = parseHonestyBreakdown(full);
    const narrative = stripHonestyJsonBlock(full);

    return {
      breakdown,
      narrative: narrative || "Review the dimension breakdown above.",
    };
  } catch (error) {
    console.error("Honesty coach error:", error);
    return {
      breakdown: null,
      narrative:
        "Honesty Coach couldn't complete the analysis. Check CURSOR_API_KEY and try again.",
    };
  }
}
