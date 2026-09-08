export type AppValidateResult = {
  passed: boolean;
  repro: string;
  homepageStatus?: number;
  cta?: { method: string; action: string; body?: string };
};

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    redirect?: RequestRedirect;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  url: string;
  text: () => Promise<string>;
}>;

const FETCH_TIMEOUT_MS = 10_000;

const OVERLAY_MARKERS = [
  "unhandled runtime error",
  "application error: a client-side exception",
  "this page isn't working",
  "nextjs-portal",
  "__next_error__",
  "a server/client exception",
];

export function looksLikeErrorPage(html: string, status?: number): boolean {
  if (typeof status === "number" && status >= 500) return true;
  const lower = html.toLowerCase();
  return OVERLAY_MARKERS.some((marker) => lower.includes(marker));
}

export function findPrimaryCta(
  html: string,
  baseUrl: string
): { method: string; action: string; body?: string } | null {
  const formMatch = html.match(
    /<form\b([^>]*)>([\s\S]*?)<\/form>/i
  );
  if (formMatch) {
    const attrs = formMatch[1];
    const inner = formMatch[2];
    const submitAttrs = submitControlAttrs(inner);
    if (submitAttrs !== null) {
      const action = attr(submitAttrs, "formaction") || attr(attrs, "action") || "/";
      const method = (
        attr(submitAttrs, "formmethod") ||
        attr(attrs, "method") ||
        "GET"
      ).toUpperCase();
      const resolved = resolveUrl(baseUrl, action);
      if (sameOrigin(baseUrl, resolved)) {
        const body = method === "POST" ? formBody(inner) : undefined;
        return { method, action: resolved, body };
      }
    }
  }

  const ctaLink = html.match(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  );
  if (ctaLink) {
    const usable = ctaLink.filter((tag) => {
      const href = attr(tag, "href");
      if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return false;
      return sameOrigin(baseUrl, resolveUrl(baseUrl, href));
    });
    const preferred = usable.find((tag) =>
      /start|begin|create|get started|continue|try|go/i.test(tag)
    );
    const chosen = preferred ?? usable[0];
    if (chosen) {
      const href = attr(chosen, "href");
      if (href) {
        return { method: "GET", action: resolveUrl(baseUrl, href) };
      }
    }
  }

  return null;
}

export function formatTessReport(result: AppValidateResult): string {
  if (result.passed) {
    const cta = result.cta
      ? ` Followed **${result.cta.method} ${result.cta.action}**.`
      : "";
    return `**Pass** — Homepage loaded (${result.homepageStatus ?? 200}).${cta} Preview is healthy.`;
  }
  return `**Fail** — ${result.repro}`;
}

export function shouldValidateAppTurn(isAppChat: boolean, agentId: string): boolean {
  return isAppChat && (agentId === "developer" || agentId === "validator");
}

/** Ideas chat ignores `/tess` so Tess never runs there. */
export function dropIdeasTessSlash(isAppChat: boolean, agentId?: string): boolean {
  return !isAppChat && agentId === "validator";
}

export function allowAmeliaFixLoop(agentId: string): boolean {
  return agentId === "developer";
}

export function canAffordAmeliaFix(remainingMs: number, round: number): boolean {
  if (remainingMs < 20_000) return false;
  if (round === 1) return remainingMs >= 90_000;
  return remainingMs >= 180_000;
}

export async function validateAppPreview(
  previewUrl: string,
  fetchImpl: FetchLike = fetch as FetchLike
): Promise<AppValidateResult> {
  const home = await fetchPage(fetchImpl, previewUrl, "GET");
  if (!home.ok) {
    return {
      passed: false,
      homepageStatus: home.status,
      repro: `GET ${previewUrl} → ${home.error}`,
    };
  }
  if (looksLikeErrorPage(home.body, home.status)) {
    return {
      passed: false,
      homepageStatus: home.status,
      repro: `GET ${previewUrl} → ${home.status} error overlay/page`,
    };
  }

  const cta = findPrimaryCta(home.body, previewUrl);
  if (!cta) {
    return {
      passed: false,
      homepageStatus: home.status,
      repro: `GET ${previewUrl} → ${home.status}; no primary CTA found`,
    };
  }

  const next = await fetchPage(fetchImpl, cta.action, cta.method, cta.body);
  if (!next.ok || looksLikeErrorPage(next.body, next.status)) {
    return {
      passed: false,
      homepageStatus: home.status,
      cta,
      repro: `GET ${previewUrl} → ${home.status}; ${cta.method} ${cta.action} → ${next.error ?? `${next.status} error overlay/page`}`,
    };
  }

  return {
    passed: true,
    homepageStatus: home.status,
    cta,
    repro: `GET ${previewUrl} → ${home.status}; ${cta.method} ${cta.action} → ${next.status}`,
  };
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : null;
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sameOrigin(base: string, url: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** Default `<button>` and `type=submit` count; explicit `type=button` does not. */
function submitControlAttrs(inner: string): string | null {
  if (/<input\b[^>]*type=["']submit["']/i.test(inner)) {
    const match = inner.match(/<input\b([^>]*type=["']submit["'][^>]*)>/i);
    return match?.[1] ?? "";
  }
  const buttons = [...inner.matchAll(/<button\b([^>]*)>/gi)];
  const submit = buttons.find((m) => (attr(m[1], "type") || "submit").toLowerCase() === "submit");
  return submit ? submit[1] : null;
}

function formBody(inner: string): string {
  const fields: string[] = [];
  const inputRe = /<input\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRe.exec(inner))) {
    const tag = match[1];
    const type = (attr(tag, "type") || "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image") continue;
    const name = attr(tag, "name");
    if (!name) continue;
    fields.push(`${encodeURIComponent(name)}=${encodeURIComponent(attr(tag, "value") ?? "")}`);
  }
  return fields.join("&");
}

async function fetchPage(
  fetchImpl: FetchLike,
  url: string,
  method: string,
  body?: string
): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const headers: Record<string, string> = { Accept: "text/html,application/xhtml+xml" };
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const pending = fetchImpl(url, {
      method,
      redirect: "follow",
      headers,
      body: method === "POST" ? (body ?? "") : undefined,
      signal: controller.signal,
    });
    void pending.catch(() => {});
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("timed out after 10s"));
      }, FETCH_TIMEOUT_MS);
    });
    const res = await Promise.race([pending, timedOut]);
    const html = await res.text();
    if (res.status >= 400) {
      return { ok: false, status: res.status, body: html, error: `${res.status}` };
    }
    return { ok: true, status: res.status, body: html };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    const timedOut =
      (error instanceof Error && error.name === "AbortError") ||
      /timed out|aborted/i.test(message);
    return {
      ok: false,
      status: 0,
      body: "",
      error: timedOut ? "timed out after 10s" : message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
