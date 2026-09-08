export type AppValidateResult = {
  passed: boolean;
  repro: string;
  homepageStatus?: number;
  cta?: { method: string; action: string; body?: string };
  followedUrl?: string;
};

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    redirect?: RequestRedirect;
    headers?: Record<string, string>;
    body?: string | FormData;
    signal?: AbortSignal;
  }
) => Promise<{
  status: number;
  url: string;
  headers?: { get(name: string): string | null; getSetCookie?: () => string[] };
  text: () => Promise<string>;
}>;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

const OVERLAY_MARKERS = [
  "unhandled runtime error",
  "application error: a client-side exception",
  "this page isn't working",
  "nextjs-portal",
  "__next_error__",
  "a server/client exception",
  'name="next-error"',
  "name='next-error'",
];

export function looksLikeErrorPage(html: string, status?: number): boolean {
  if (typeof status === "number" && status >= 400) return true;
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
    const landed = result.followedUrl ? ` → ${result.followedUrl}` : "";
    const cta = result.cta
      ? ` Followed **${result.cta.method} ${result.cta.action}**${landed}.`
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

export function isNextServerActionBody(body?: string): boolean {
  if (!body) return false;
  return parseFormFields(body).some(
    ([name]) => name.startsWith("$ACTION_ID") || name.startsWith("$ACTION_REF")
  );
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

  const next = await fetchPage(fetchImpl, cta.action, cta.method, {
    body: cta.body,
    nextAction: isNextServerActionBody(cta.body),
    cookie: home.cookie,
  });
  if (!next.ok || looksLikeErrorPage(next.body, next.status)) {
    return {
      passed: false,
      homepageStatus: home.status,
      cta,
      followedUrl: next.url,
      repro: `GET ${previewUrl} → ${home.status}; ${cta.method} ${cta.action} → ${next.error ?? `${next.status} error overlay/page`} (${next.url})`,
    };
  }

  if (isNextServerActionBody(cta.body) && samePath(previewUrl, next.url)) {
    return {
      passed: false,
      homepageStatus: home.status,
      cta,
      followedUrl: next.url,
      repro: `GET ${previewUrl} → ${home.status}; ${cta.method} ${cta.action} → ${next.status} same page (server action did not navigate)`,
    };
  }

  return {
    passed: true,
    homepageStatus: home.status,
    cta,
    followedUrl: next.url,
    repro: `GET ${previewUrl} → ${home.status}; ${cta.method} ${cta.action} → ${next.status} ${next.url}`,
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

function samePath(a: string, b: string): boolean {
  try {
    const pa = new URL(a).pathname.replace(/\/+$/, "") || "/";
    const pb = new URL(b).pathname.replace(/\/+$/, "") || "/";
    return pa === pb;
  } catch {
    return a === b;
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

function parseFormFields(body: string): Array<[string, string]> {
  if (!body) return [];
  return body.split("&").filter(Boolean).map((pair) => {
    const eq = pair.indexOf("=");
    const rawName = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
    return [decodeComponent(rawName), decodeComponent(rawValue)];
  });
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

function readSetCookies(headers?: {
  get(name: string): string | null;
  getSetCookie?: () => string[];
}): string[] {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie().map((cookie) => cookie.split(";")[0]?.trim() ?? "").filter(Boolean);
  }
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return [raw.split(";")[0]?.trim()].filter(Boolean);
}

function mergeCookies(existing: string | undefined, setCookies: string[]): string | undefined {
  const map = new Map<string, string>();
  if (existing) {
    for (const part of existing.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      const name = eq === -1 ? trimmed : trimmed.slice(0, eq);
      const value = eq === -1 ? "" : trimmed.slice(eq + 1);
      map.set(name, value);
    }
  }
  for (const pair of setCookies) {
    const eq = pair.indexOf("=");
    const name = (eq === -1 ? pair : pair.slice(0, eq)).trim();
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    if (name) map.set(name, value);
  }
  if (map.size === 0) return undefined;
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

type FetchPageOptions = {
  body?: string;
  nextAction?: boolean;
  cookie?: string;
  hops?: number;
};

async function fetchPage(
  fetchImpl: FetchLike,
  url: string,
  method: string,
  options: FetchPageOptions = {}
): Promise<{ ok: boolean; status: number; body: string; url: string; error?: string; cookie?: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hops = options.hops ?? 0;
  try {
    const headers: Record<string, string> = { Accept: "text/html,application/xhtml+xml" };
    if (options.cookie) headers.Cookie = options.cookie;

    let body: string | FormData | undefined;
    if (method === "POST") {
      if (options.nextAction) {
        const formData = new FormData();
        for (const [name, value] of parseFormFields(options.body ?? "")) {
          formData.append(name, value);
        }
        body = formData;
      } else {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        body = options.body ?? "";
      }
    }

    const pending = fetchImpl(url, {
      method,
      redirect: "manual",
      headers,
      body,
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
    const cookie = mergeCookies(options.cookie, readSetCookies(res.headers));

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers?.get("location");
      if (!location) {
        return { ok: false, status: res.status, body: html, url, cookie, error: `${res.status} redirect with no Location` };
      }
      const nextUrl = resolveUrl(url, location);
      if (!sameOrigin(url, nextUrl)) {
        return { ok: false, status: res.status, body: html, url, cookie, error: `${res.status} redirected off-origin` };
      }
      if (hops >= MAX_REDIRECTS) {
        return { ok: false, status: res.status, body: html, url, cookie, error: `too many redirects` };
      }
      return fetchPage(fetchImpl, nextUrl, "GET", { cookie, hops: hops + 1 });
    }

    if (res.status >= 400) {
      return { ok: false, status: res.status, body: html, url: res.url || url, cookie, error: `${res.status}` };
    }
    return { ok: true, status: res.status, body: html, url: res.url || url, cookie };
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    const timedOut =
      (error instanceof Error && error.name === "AbortError") ||
      /timed out|aborted/i.test(message);
    return {
      ok: false,
      status: 0,
      body: "",
      url,
      error: timedOut ? "timed out after 10s" : message,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
