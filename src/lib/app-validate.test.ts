import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSlashCommand } from "./slash-commands";
import { routeAppMessage } from "./agent-router";
import {
  allowAmeliaFixLoop,
  canAffordAmeliaFix,
  dropIdeasTessSlash,
  findPrimaryCta,
  formatTessReport,
  isNextServerActionBody,
  looksLikeErrorPage,
  shouldValidateAppTurn,
  validateAppPreview,
  type FetchLike,
} from "./app-validate";

type MockPage = {
  status: number;
  body: string;
  location?: string;
  setCookie?: string;
  requireCookie?: string;
  expectFormData?: boolean;
};

function mockFetch(pages: Record<string, MockPage>): FetchLike {
  return async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url}`;
    const page = pages[key] ?? pages[url];
    const headers = {
      get(name: string) {
        const n = name.toLowerCase();
        if (n === "location") return page?.location ?? null;
        if (n === "set-cookie") return page?.setCookie ?? null;
        return null;
      },
    };
    if (!page) {
      return { status: 404, url, headers, text: async () => "not found" };
    }
    if (page.expectFormData && !(init?.body instanceof FormData)) {
      return { status: 415, url, headers, text: async () => "expected multipart FormData" };
    }
    if (page.requireCookie) {
      const cookie = init?.headers?.Cookie ?? init?.headers?.cookie ?? "";
      if (!cookie.includes(page.requireCookie)) {
        return {
          status: 404,
          url,
          headers,
          text: async () => `<html><body><meta name="next-error" content="not-found"/><h1>Story not found</h1></body></html>`,
        };
      }
    }
    return { status: page.status, url, headers, text: async () => page.body };
  };
}

const HOME_OK = `<html><body><form action="/start" method="post"><button type="submit">Start your story</button></form></body></html>`;
const HOME_OVERLAY = `<html><body><nextjs-portal></nextjs-portal><p>Unhandled Runtime Error</p></body></html>`;
const NEXT_OK = `<html><body><h1>Story</h1></body></html>`;
const NEXT_500 = `<html><body>server boom</body></html>`;
const NEXT_ACTION_HOME = `<html><body><form action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_ID_000ebe85c565350eefac6ad2595daa8c27c76d5ad7"/><button type="submit">Start your story</button></form></body></html>`;
const INTERVIEW_OK = `<html><body><h1>Story interview</h1></body></html>`;
const INTERVIEW_404 = `<html><body><meta name="next-error" content="not-found"/><h1>Story not found</h1></body></html>`;

test("matrix: build pass — homepage + CTA ok", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: HOME_OK },
      "POST http://localhost:43200/start": { status: 200, body: NEXT_OK },
    })
  );
  assert.equal(result.passed, true);
  assert.match(formatTessReport(result), /Pass/);
  assert.equal(shouldValidateAppTurn(true, "developer"), true);
  assert.equal(allowAmeliaFixLoop("developer"), true);
});

test("matrix: CTA broken — follow returns 5xx / overlay", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: HOME_OK },
      "POST http://localhost:43200/start": { status: 500, body: NEXT_500 },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /POST/);
  assert.match(formatTessReport(result), /Fail/);
  assert.equal(canAffordAmeliaFix(200_000, 1), true);
  assert.equal(canAffordAmeliaFix(100_000, 2), false);
  assert.equal(canAffordAmeliaFix(10_000, 1), false);
});

test("matrix: preview down — cannot start", () => {
  const report = formatTessReport({
    passed: false,
    repro: "Cannot start the preview (The app server did not come up on time.).",
  });
  assert.match(report, /Fail/);
  assert.match(report, /Cannot start the preview/);
});

test("matrix: /tess — slash routes to Tess, no Amelia auto-build", () => {
  const slash = parseSlashCommand("/tess");
  assert.equal(slash?.agentId, "validator");
  assert.equal(shouldValidateAppTurn(true, "validator"), true);
  assert.equal(allowAmeliaFixLoop("validator"), false);
  assert.equal(dropIdeasTessSlash(true, "validator"), false);
});

test("matrix: discussion — Apps question does not start Tess", () => {
  const route = routeAppMessage("The empty state copy is confusing. What should we change?");
  assert.notEqual(route.agentId, "developer");
  assert.notEqual(route.agentId, "validator");
  assert.equal(shouldValidateAppTurn(true, route.agentId), false);
  assert.equal(allowAmeliaFixLoop(route.agentId), false);
  assert.equal(shouldValidateAppTurn(false, "developer"), false);
});

test("Ideas /tess slash is dropped", () => {
  assert.equal(dropIdeasTessSlash(false, "validator"), true);
  assert.equal(dropIdeasTessSlash(false, "forge"), false);
  assert.equal(dropIdeasTessSlash(true, "validator"), false);
});

test("homepage with no primary CTA fails", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: "<html><body><p>Hello</p></body></html>" },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /no primary CTA/i);
  assert.match(formatTessReport(result), /Fail/);
});

test("4xx homepage or CTA follow fails", async () => {
  const home404 = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 404, body: "missing" },
    })
  );
  assert.equal(home404.passed, false);
  assert.match(home404.repro, /404/);

  const cta404 = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: HOME_OK },
      "POST http://localhost:43200/start": { status: 404, body: "missing" },
    })
  );
  assert.equal(cta404.passed, false);
  assert.match(cta404.repro, /404/);
});

test("decodes HTML entities in bound Next action fields", () => {
  const html = `<html><body><form action="" method="post"><input type="hidden" name="$ACTION_1:0" value="{&quot;id&quot;:&quot;abc&quot;}"/><button type="submit">Go</button></form></body></html>`;
  const cta = findPrimaryCta(html, "http://localhost:43200/project/x/interview");
  assert.equal(cta?.action, "http://localhost:43200/project/x/interview");
  assert.equal(decodeURIComponent(cta?.body?.split("=")[1] ?? ""), '{"id":"abc"}');
});

test("posts hidden form fields with the primary CTA", () => {
  const html = `<html><body><form action="/start" method="post"><input type="hidden" name="$ACTION_ID" value="abc"><button type="submit">Start</button></form></body></html>`;
  const cta = findPrimaryCta(html, "http://localhost:43200/");
  assert.equal(cta?.method, "POST");
  assert.equal(cta?.body, "%24ACTION_ID=abc");
});

test("detects Next error overlay and finds primary CTA", () => {
  assert.equal(looksLikeErrorPage(HOME_OVERLAY, 200), true);
  assert.equal(looksLikeErrorPage(HOME_OK, 200), false);
  assert.equal(looksLikeErrorPage(INTERVIEW_404, 404), true);
  assert.equal(
    looksLikeErrorPage(
      "Application error: a server-side exception has occurred while loading 127.0.0.1",
      200
    ),
    true
  );
  const cta = findPrimaryCta(HOME_OK, "http://localhost:43200/");
  assert.deepEqual(cta, { method: "POST", action: "http://localhost:43200/start", body: "" });
});

test("Next server-action form that 200s the same homepage fails", async () => {
  const cta = findPrimaryCta(NEXT_ACTION_HOME, "http://localhost:43200/");
  assert.equal(cta?.method, "POST");
  assert.equal(cta?.action, "http://localhost:43200/");
  assert.equal(isNextServerActionBody(cta?.body), true);

  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME, expectFormData: true },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /did not navigate/i);
});

test("Next server-action POST + follow to 500 next page fails", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        setCookie: "sb_session=abc; Path=/",
        expectFormData: true,
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 500,
        body: NEXT_500,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /500/);
});

test("Next server-action POST + follow to 404 next page fails", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        setCookie: "sb_session=abc; Path=/",
        expectFormData: true,
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 404,
        body: INTERVIEW_404,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /404/);
});

test("Next server-action POST + cookie follow to healthy next page passes", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        setCookie: "sb_session=abc; Path=/",
        expectFormData: true,
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 200,
        body: INTERVIEW_OK,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, true);
  assert.match(formatTessReport(result), /Pass/);
  assert.match(result.followedUrl ?? "", /\/project\/abc\/interview/);
});

test("Next server-action follow without sending the session cookie fails", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        expectFormData: true,
        // no setCookie — Tess must not treat a cookieless 404 as a pass
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 404,
        body: INTERVIEW_404,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /404/);
});

test("forwards homepage Set-Cookie on the server-action POST", async () => {
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": {
        status: 200,
        body: NEXT_ACTION_HOME,
        setCookie: "csrf=home; Path=/",
      },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        setCookie: "sb_session=abc; Path=/",
        expectFormData: true,
        requireCookie: "csrf=home",
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 200,
        body: INTERVIEW_OK,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, true);
});

test("second-page server-action form that 500s fails", async () => {
  const interview = `<html><body><form action="" encType="multipart/form-data" method="POST"><input type="hidden" name="$ACTION_ID_deadbeef"/><button type="submit">Generate beat sheet</button></form><h1>Story interview</h1></body></html>`;
  const result = await validateAppPreview(
    "http://localhost:43200/",
    mockFetch({
      "GET http://localhost:43200/": { status: 200, body: NEXT_ACTION_HOME },
      "POST http://localhost:43200/": {
        status: 303,
        body: "",
        location: "/project/abc/interview",
        setCookie: "sb_session=abc; Path=/",
        expectFormData: true,
      },
      "GET http://localhost:43200/project/abc/interview": {
        status: 200,
        body: interview,
        requireCookie: "sb_session=abc",
      },
      "POST http://localhost:43200/project/abc/interview": {
        status: 500,
        body: "Application error: a server-side exception has occurred while loading 127.0.0.1",
        expectFormData: true,
        requireCookie: "sb_session=abc",
      },
    })
  );
  assert.equal(result.passed, false);
  assert.match(result.repro, /500|server-side exception/i);
});
