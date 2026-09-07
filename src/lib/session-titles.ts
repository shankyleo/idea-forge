const GENERIC_TITLES = new Set([
  "new conversation",
  "thinking session",
  "new thinking session",
  "untitled conversation",
]);

const TITLE_OPENERS =
  /^(?:i have an idea(?:\s+(?:in terms of|about|for|to))?|in terms of|i(?:'m| am) thinking (?:about|of)|what if (?:we|i)|i want to|thinking about|considering|maybe)\s+/i;

/** Strip slash commands and conversational filler to produce a readable title. */
export function normalizeConversationTitle(text: string, maxLen = 60): string {
  let t = text.trim();
  t = t.replace(/^\/[\w-]+\s*/i, "");
  t = t.replace(TITLE_OPENERS, "");
  t = t.replace(/^[\s,:-]+/, "");

  const sentence = (t.split(/[.!?]/)[0]?.trim() ?? t).trim();
  t = sentence.length >= 8 ? sentence : t.trim();

  if (!t) return "Untitled conversation";

  t = t.charAt(0).toUpperCase() + t.slice(1);

  if (t.length > maxLen) {
    const cut = t.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(" ");
    t =
      lastSpace > maxLen * 0.55 ? `${cut.slice(0, lastSpace).trim()}…` : `${cut.trim()}…`;
  }

  return t;
}

export function isGenericSessionTitle(title: string): boolean {
  return GENERIC_TITLES.has(title.trim().toLowerCase());
}

export function resolveSessionDisplayTitle(input: {
  sessionTitle: string;
  ideaTitle?: string | null;
  firstUserMessage?: string | null;
}): string {
  const { sessionTitle, ideaTitle, firstUserMessage } = input;

  if (!isGenericSessionTitle(sessionTitle)) {
    return normalizeConversationTitle(sessionTitle);
  }

  if (ideaTitle && !isGenericSessionTitle(ideaTitle)) {
    return normalizeConversationTitle(ideaTitle);
  }

  if (firstUserMessage) {
    const fromMessage = normalizeConversationTitle(firstUserMessage);
    if (!isGenericSessionTitle(fromMessage)) return fromMessage;
  }

  return sessionTitle;
}
