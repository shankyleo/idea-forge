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
import { extractAppStackQueries, runAppStackRecon, shouldRunAppStackRecon } from "./web-research";
import {
  ameliaCommitMessage,
  NODE_GITIGNORE,
  pushAppBuild,
  shouldSkipAppGitPush,
} from "./app-git-push";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

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

test("matrix: John/Winston Apps lead runs stack recon; others do not", () => {
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "product-manager", casual: false }),
    true
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "architect", casual: false }),
    true
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "ux-designer", casual: false }),
    false
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "developer", casual: false }),
    false
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "validator", casual: false }),
    false
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: "product-manager", casual: true }),
    false
  );
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: false, agentId: "product-manager", casual: false }),
    false
  );
  const route = routeAppMessage("The empty state copy is confusing. What should we change?");
  assert.equal(
    shouldRunAppStackRecon({ isAppChat: true, agentId: route.agentId, casual: false }),
    false
  );
});

test("matrix: Apps stack queries are technical, not TAM", async () => {
  const queries = extractAppStackQueries("image generation for the home screen");
  assert.equal(queries.length, 3);
  for (const q of queries) {
    assert.equal(/market size|TAM|competitors 2025/i.test(q), false);
    assert.match(q, /current API|discontinued|stack official docs/i);
  }

  const originalFetch = globalThis.fetch;
  const ddgHtml =
    `<a class="result__a" href="https://platform.openai.com/docs/images">GPT Image API</a>` +
    `<a class="result__snippet">Use the current Images API; DALL·E is discontinued.</a>`;
  globalThis.fetch = (async () => ({
    ok: true,
    text: async () => ddgHtml,
  })) as typeof fetch;
  try {
    const recon = await runAppStackRecon("image generation for the home screen");
    assert.match(recon.researchBlock, /Live stack \/ API research/);
    assert.match(recon.researchBlock, /GPT Image API/);
    assert.match(recon.researchBlock, /current Images API/);
    assert.equal(/Depth assessment|market size|TAM/i.test(recon.researchBlock), false);
    assert.ok(recon.findings.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("matrix: skip push when githubRepo empty; gitignore before add", () => {
  assert.equal(shouldSkipAppGitPush(""), true);
  assert.equal(shouldSkipAppGitPush("   "), true);
  assert.equal(shouldSkipAppGitPush(undefined), true);
  assert.equal(shouldSkipAppGitPush("acme/app"), false);
  const silent = pushAppBuild("/tmp", "", "Amelia: Get started");
  assert.equal(silent.note, "");
  assert.equal(silent.pushed, false);
  assert.match(NODE_GITIGNORE, /node_modules/);
  assert.match(NODE_GITIGNORE, /\.env/);
  assert.match(NODE_GITIGNORE, /\.next/);
  assert.equal(ameliaCommitMessage("Get started"), "Amelia: Get started");
  assert.match(ameliaCommitMessage("Add a settings page for theme"), /^Amelia: Add a settings page/);
});

test("matrix: clean tree notes nothing to push; secrets stay untracked", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idea-forge-push-"));
  const dir = path.join(root, "app");
  const bare = path.join(root, "remote.git");
  const retryDir = path.join(root, "retry");
  const retryBare = path.join(root, "retry.git");
  fs.mkdirSync(dir);
  fs.mkdirSync(retryDir);
  try {
    execFileSync("git", ["init", "--bare", bare], { encoding: "utf8" });
    execFileSync("git", ["init", "--bare", retryBare], { encoding: "utf8" });
    execFileSync("git", ["init"], { cwd: dir, encoding: "utf8" });
    execFileSync("git", ["remote", "add", "origin", bare], { cwd: dir, encoding: "utf8" });
    fs.writeFileSync(path.join(dir, ".gitignore"), "dist/\n");
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    fs.writeFileSync(path.join(dir, "app.js"), "console.log('ok');\n");
    const first = pushAppBuild(dir, "acme/demo", "Amelia: Get started");
    assert.equal(first.pushed, true);
    assert.equal(first.note, "Pushed to https://github.com/acme/demo");
    const gitignore = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    assert.match(gitignore, /dist/);
    assert.match(gitignore, /node_modules/);
    assert.match(gitignore, /\.env/);
    assert.match(gitignore, /\.next/);
    const lsFiles = execFileSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" });
    assert.equal(lsFiles.includes(".env"), false);
    assert.equal(lsFiles.includes("app.js"), true);
    const clean = pushAppBuild(dir, "acme/demo", "Amelia: Get started");
    assert.equal(clean.note, "Nothing new to push");
    assert.equal(clean.pushed, false);

    execFileSync("git", ["init"], { cwd: retryDir, encoding: "utf8" });
    fs.writeFileSync(path.join(retryDir, "app.js"), "console.log('retry');\n");
    const missed = pushAppBuild(retryDir, "acme/demo", "Amelia: Get started");
    assert.equal(missed.pushed, false);
    assert.match(missed.note, /GitHub push failed/);
    execFileSync("git", ["remote", "remove", "origin"], { cwd: retryDir, encoding: "utf8" });
    execFileSync("git", ["remote", "add", "origin", retryBare], { cwd: retryDir, encoding: "utf8" });
    const retried = pushAppBuild(retryDir, "acme/demo", "Amelia: Get started");
    assert.equal(retried.pushed, true);
    assert.equal(retried.note, "Pushed to https://github.com/acme/demo");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
