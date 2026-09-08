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
  looksLikeErrorPage,
  shouldValidateAppTurn,
  validateAppPreview,
  type FetchLike,
} from "./app-validate";

function mockFetch(pages: Record<string, { status: number; body: string }>): FetchLike {
  return async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url}`;
    const page = pages[key] ?? pages[url];
    if (!page) {
      return { status: 404, url, text: async () => "not found" };
    }
    return { status: page.status, url, text: async () => page.body };
  };
}

const HOME_OK = `<html><body><form action="/start" method="post"><button type="submit">Start your story</button></form></body></html>`;
const HOME_OVERLAY = `<html><body><nextjs-portal></nextjs-portal><p>Unhandled Runtime Error</p></body></html>`;
const NEXT_OK = `<html><body><h1>Story</h1></body></html>`;
const NEXT_500 = `<html><body>server boom</body></html>`;

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

test("posts hidden form fields with the primary CTA", () => {
  const html = `<html><body><form action="/start" method="post"><input type="hidden" name="$ACTION_ID" value="abc"><button type="submit">Start</button></form></body></html>`;
  const cta = findPrimaryCta(html, "http://localhost:43200/");
  assert.equal(cta?.method, "POST");
  assert.equal(cta?.body, "%24ACTION_ID=abc");
});

test("detects Next error overlay and finds primary CTA", () => {
  assert.equal(looksLikeErrorPage(HOME_OVERLAY, 200), true);
  assert.equal(looksLikeErrorPage(HOME_OK, 200), false);
  const cta = findPrimaryCta(HOME_OK, "http://localhost:43200/");
  assert.deepEqual(cta, { method: "POST", action: "http://localhost:43200/start", body: "" });
});
