import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createSession, getApp, getAppForIdea, getAppForSession, getIdea, getMessages, upsertApp } from "@/lib/db";
import type { AppRecord } from "@/lib/types";

const BLOCKED_PREFIXES = [
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/System",
  "/private",
  "/dev",
  "/proc",
  "/root",
  "/var",
];

export function parseGithubRepo(raw: string): { owner: string; name: string } | null {
  const trimmed = raw.trim().replace(/\.git$/i, "");
  const fromUrl = trimmed.match(/github\.com[:/]([^/\s]+)\/([^/\s?#]+)/i);
  if (fromUrl) return { owner: fromUrl[1], name: fromUrl[2] };
  const short = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (short) return { owner: short[1], name: short[2] };
  return null;
}

export function resolveLocalPath(raw: string): { ok: true; path: string } | { ok: false; error: string } {
  const expanded = raw.trim().replace(/^~(?=$|[/\\])/, os.homedir());
  if (!path.isAbsolute(expanded)) {
    return { ok: false, error: "Use an absolute folder path (you can start with ~)." };
  }
  const resolved = path.resolve(expanded);
  const blocked = BLOCKED_PREFIXES.some(
    (prefix) => resolved === prefix || resolved.startsWith(`${prefix}/`)
  );
  if (blocked) {
    return { ok: false, error: "That path is a system directory. Pick a project folder you own." };
  }
  return { ok: true, path: resolved };
}

export function pickLocalFolder():
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string } {
  if (process.platform === "darwin") {
    const picked = run(
      "osascript",
      [
        "-e",
        "try",
        "-e",
        'POSIX path of (choose folder with prompt "Choose a folder for this app")',
        "-e",
        "on error number -128",
        "-e",
        'return ""',
        "-e",
        "end try",
      ],
      undefined,
      180_000
    );
    if (!picked.ok) {
      if (/canceled|cancelled/i.test(picked.out)) return { ok: false, cancelled: true };
      return { ok: false, error: picked.out || "Could not open the folder picker." };
    }
    const pathText = picked.out.replace(/\/$/, "").trim();
    if (!pathText) return { ok: false, cancelled: true };
    const resolved = resolveLocalPath(pathText);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, path: resolved.path };
  }

  if (process.platform === "linux") {
    const picked = run(
      "zenity",
      ["--file-selection", "--directory", "--title=Choose a folder for this app"],
      undefined,
      180_000
    );
    if (!picked.ok) {
      if (/code 1|cancel/i.test(picked.out)) return { ok: false, cancelled: true };
      return {
        ok: false,
        error: "Folder picker needs zenity, or paste an absolute path instead.",
      };
    }
    const resolved = resolveLocalPath(picked.out.replace(/\/$/, "").trim());
    if (!resolved.ok) return { ok: false, error: resolved.error };
    return { ok: true, path: resolved.path };
  }

  return {
    ok: false,
    error: "Folder picker is not available here. Paste an absolute folder path instead.",
  };
}

function run(cmd: string, args: string[], cwd?: string, timeoutMs = 60_000): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out: out.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return { ok: false, out: (err.stderr || err.message || "command failed").toString().trim() };
  }
}

function writeCharter(input: {
  localPath: string;
  title: string;
  objective: string;
  githubRepo: string;
  plan: string;
  sessionId: string;
}) {
  fs.mkdirSync(input.localPath, { recursive: true });
  const plan = input.plan.trim() || input.objective;

  fs.writeFileSync(
    path.join(input.localPath, "START.md"),
    `# Get started

Open this folder in a **new Cursor window**.

- **App:** ${input.title}
- **GitHub:** ${input.githubRepo || "Add later from Apps in Idea Forge"}

1. Read \`SPEC.md\` — what to build
2. Read \`ARCHITECTURE.md\` — stack, platform, hosting
3. Read \`BUILD.md\` — order of work and BMAD install
4. Ask the agent: follow these markdown files and start the MVP

Promoted from Idea Forge chat \`${input.sessionId}\`.
`
  );

  fs.writeFileSync(
    path.join(input.localPath, "APP.md"),
    `# ${input.title}

## Objective

${input.objective}
`
  );

  fs.writeFileSync(
    path.join(input.localPath, "SPEC.md"),
    `# Spec — ${input.title}

## Why

${input.objective}

## From the Idea Forge thread

${plan}
`
  );

  fs.writeFileSync(
    path.join(input.localPath, "ARCHITECTURE.md"),
    `# Architecture — ${input.title}

Use the plan below as the starting spine. Confirm stack, web vs mobile vs both, and hosting before you write code.

${plan}
`
  );

  fs.writeFileSync(
    path.join(input.localPath, "BUILD.md"),
    `# Build — ${input.title}

## Order

1. Scaffold the app in this folder if it is still empty besides these markdown files.
2. Implement the MVP in \`SPEC.md\`.
3. Match \`ARCHITECTURE.md\` for platform and hosting.

## BMAD in this repo

Install BMAD **here** (the new app), not in Idea Forge:

\`\`\`bash
npx bmad-method install
\`\`\`

Then use \`bmad-build\` (or Amelia) against these files.
`
  );
}

function githubLabel(repo: string): string {
  return repo.trim() ? `https://github.com/${repo}` : "Add later from Apps in Idea Forge";
}

function getStartedText(localPath: string, githubRepo: string, ghStatus: string): string {
  return `Get started

1. Open this app's chat in Idea Forge and press **Get started**, or open the folder in a new Cursor window:
   ${localPath}
2. GitHub: ${githubLabel(githubRepo)}
3. Read START.md, then SPEC.md and ARCHITECTURE.md.

${ghStatus}`;
}

function dedicatedChatForApp(
  existing: AppRecord | null,
  ideaSessionId: string,
  title: string
): { sessionId: string; sourceSessionId: string } {
  if (existing?.sourceSessionId) {
    return { sessionId: existing.sessionId, sourceSessionId: existing.sourceSessionId };
  }
  if (existing && existing.sessionId !== ideaSessionId) {
    return { sessionId: existing.sessionId, sourceSessionId: ideaSessionId };
  }
  const chat = createSession(title.slice(0, 60), "developer");
  return { sessionId: chat.id, sourceSessionId: ideaSessionId };
}

function commitCharter(localPath: string): string[] {
  const notes: string[] = [];
  if (!fs.existsSync(path.join(localPath, ".git"))) {
    const init = run("git", ["init"], localPath);
    if (!init.ok) return [`git init failed: ${init.out}`];
  }
  run("git", ["add", "START.md", "APP.md", "SPEC.md", "ARCHITECTURE.md", "BUILD.md"], localPath);
  const commit = run("git", ["commit", "-m", "Initial app charter from Idea Forge"], localPath);
  if (!commit.ok && !/nothing to commit/i.test(commit.out)) {
    notes.push(`git commit: ${commit.out}`);
  }
  return notes;
}

function attachGithub(localPath: string, owner: string, name: string): string {
  const full = `${owner}/${name}`;
  const notes = commitCharter(localPath);
  if (notes[0]?.startsWith("git init failed")) return notes[0];

  const viewed = run("gh", ["repo", "view", full, "--json", "url", "-q", ".url"]);
  if (viewed.ok) {
    run("git", ["remote", "remove", "origin"], localPath);
    const remote = run("git", ["remote", "add", "origin", viewed.out || `https://github.com/${full}.git`], localPath);
    if (!remote.ok && !/already exists/i.test(remote.out)) notes.push(remote.out);
    const push = run("git", ["push", "-u", "origin", "HEAD"], localPath);
    if (!push.ok) notes.push(`push: ${push.out}`);
    notes.unshift(`Attached existing GitHub repo ${full}`);
    return notes.join("\n");
  }

  const created = run(
    "gh",
    ["repo", "create", full, "--private", "--source", ".", "--remote", "origin", "--push"],
    localPath
  );
  if (created.ok) return `Created GitHub repo ${full} and pushed the charter.`;
  return `GitHub: ${created.out}. Charter is on disk; create or attach ${full} when gh is logged in.`;
}

function updateStartGithub(localPath: string, githubRepo: string) {
  const startPath = path.join(localPath, "START.md");
  if (!fs.existsSync(startPath)) return;
  const current = fs.readFileSync(startPath, "utf8");
  const next = current.replace(/- \*\*GitHub:\*\*.*/, `- **GitHub:** ${githubRepo}`);
  if (next !== current) fs.writeFileSync(startPath, next);
}

export function promoteToApp(input: {
  sessionId: string;
  ideaId?: string;
  localPath: string;
  githubRepo?: string;
}): { app: AppRecord } | { error: string } {
  const githubRaw = input.githubRepo?.trim() ?? "";
  const parsed = githubRaw ? parseGithubRepo(githubRaw) : null;
  if (githubRaw && !parsed) {
    return { error: "GitHub repo must look like owner/name or a github.com URL." };
  }

  const resolved = resolveLocalPath(input.localPath);
  if (!resolved.ok) return { error: resolved.error };

  const messages = getMessages(input.sessionId);
  const idea = input.ideaId ? getIdea(input.ideaId) : null;
  const winstonPlan =
    [...messages].reverse().find((m) => m.role === "assistant" && m.agentId === "architect")
      ?.content ??
    [...messages].reverse().find((m) => m.role === "assistant")?.content ??
    "";

  const title = idea?.title?.trim() || "New app";
  const objective =
    idea?.summary?.trim() ||
    winstonPlan.replace(/[#*`]/g, "").slice(0, 400) ||
    "Build the product described in this thread.";

  const githubRepo = parsed ? `${parsed.owner}/${parsed.name}` : "";

  writeCharter({
    localPath: resolved.path,
    title,
    objective,
    githubRepo,
    plan: winstonPlan.slice(0, 12_000),
    sessionId: input.sessionId,
  });

  const ghStatus = parsed
    ? attachGithub(resolved.path, parsed.owner, parsed.name)
    : (() => {
        const notes = commitCharter(resolved.path);
        if (notes[0]?.startsWith("git init failed")) return notes[0];
        return ["GitHub not set. Add a repo later from Apps.", ...notes].filter(Boolean).join("\n");
      })();

  const getStarted = getStartedText(resolved.path, githubRepo, ghStatus);

  const existing =
    (idea?.id ? getAppForIdea(idea.id) : null) ?? getAppForSession(input.sessionId);
  const chat = dedicatedChatForApp(existing, input.sessionId, title);

  const app = upsertApp({
    id: existing?.id,
    ideaId: idea?.id,
    sessionId: chat.sessionId,
    sourceSessionId: chat.sourceSessionId,
    title,
    objective,
    localPath: resolved.path,
    githubRepo,
    getStarted,
    ghStatus,
  });

  return { app };
}

export function attachGithubToApp(
  appId: string,
  githubRepoRaw: string
): { app: AppRecord } | { error: string } {
  const app = getApp(appId);
  if (!app) return { error: "App not found" };

  const parsed = parseGithubRepo(githubRepoRaw);
  if (!parsed) {
    return { error: "GitHub repo must look like owner/name or a github.com URL." };
  }

  const githubRepo = `${parsed.owner}/${parsed.name}`;
  updateStartGithub(app.localPath, githubLabel(githubRepo));
  const ghStatus = attachGithub(app.localPath, parsed.owner, parsed.name);
  const getStarted = getStartedText(app.localPath, githubRepo, ghStatus);

  return {
    app: upsertApp({
      id: app.id,
      ideaId: app.ideaId,
      sessionId: app.sessionId,
      sourceSessionId: app.sourceSessionId,
      title: app.title,
      objective: app.objective,
      localPath: app.localPath,
      githubRepo,
      getStarted,
      ghStatus,
    }),
  };
}
