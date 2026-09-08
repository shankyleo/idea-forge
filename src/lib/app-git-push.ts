import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export const NODE_GITIGNORE = `node_modules/
.next/
.env
.env.*
`;

function run(cmd: string, args: string[], cwd?: string, timeoutMs = 60_000): { ok: boolean; out: string } {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.error) {
    return { ok: false, out: result.error.message || out || "command failed" };
  }
  if (result.status !== 0) {
    return { ok: false, out: out || "command failed" };
  }
  return { ok: true, out };
}

export function shouldSkipAppGitPush(githubRepo: string | undefined | null): boolean {
  return !githubRepo?.trim();
}

export function ensureNodeGitignore(localPath: string): void {
  const gitignorePath = path.join(localPath, ".gitignore");
  const required = NODE_GITIGNORE.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, NODE_GITIGNORE);
    return;
  }
  const current = fs.readFileSync(gitignorePath, "utf8");
  const existing = new Set(current.split("\n").map((line) => line.trim()).filter(Boolean));
  const missing = required.filter((line) => !existing.has(line));
  if (missing.length === 0) return;
  const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  fs.writeFileSync(gitignorePath, `${current}${prefix}${missing.join("\n")}\n`);
}

export function ameliaCommitMessage(userMessage: string): string {
  const trimmed = userMessage.trim();
  if (/^(get started|build this)[.!]?$/i.test(trimmed)) {
    return "Amelia: Get started";
  }
  return `Amelia: ${trimmed.replace(/\s+/g, " ").slice(0, 72)}`;
}

export function pushAppBuild(
  localPath: string,
  githubRepo: string,
  message: string
): { note: string; pushed: boolean } {
  try {
    if (shouldSkipAppGitPush(githubRepo)) {
      return { note: "", pushed: false };
    }

    const repo = githubRepo.trim();
    const repoUrl = `https://github.com/${repo}`;

    ensureNodeGitignore(localPath);

    if (!fs.existsSync(path.join(localPath, ".git"))) {
      const init = run("git", ["init"], localPath);
      if (!init.ok) {
        return { note: `GitHub push failed: git init failed: ${init.out}`, pushed: false };
      }
    }

    const remotes = run("git", ["remote"], localPath);
    if (!remotes.ok) {
      return { note: `GitHub push failed: ${remotes.out}`, pushed: false };
    }
    if (!remotes.out.split(/\s+/).includes("origin")) {
      const addRemote = run(
        "git",
        ["remote", "add", "origin", `https://github.com/${repo}.git`],
        localPath
      );
      if (!addRemote.ok) {
        return { note: `GitHub push failed: ${addRemote.out}`, pushed: false };
      }
    }

    const add = run("git", ["add", "-A"], localPath);
    if (!add.ok) {
      return { note: `GitHub push failed: git add failed: ${add.out}`, pushed: false };
    }

    const status = run("git", ["status", "--porcelain"], localPath);
    if (!status.ok) {
      return { note: `GitHub push failed: ${status.out}`, pushed: false };
    }

    let madeCommit = false;
    if (status.out) {
      const commit = run(
        "git",
        ["-c", "user.name=Amelia", "-c", "user.email=amelia@idea-forge.local", "commit", "-m", message],
        localPath
      );
      if (!commit.ok && !/nothing to commit/i.test(commit.out)) {
        return { note: `GitHub push failed: git commit: ${commit.out}`, pushed: false };
      }
      madeCommit = commit.ok;
    }

    const push = run("git", ["push", "-u", "origin", "HEAD"], localPath);
    if (!push.ok) {
      return { note: `GitHub push failed: ${push.out}`, pushed: false };
    }

    if (!madeCommit && /everything up-to-date/i.test(push.out)) {
      return { note: "Nothing new to push", pushed: false };
    }

    return { note: `Pushed to ${repoUrl}`, pushed: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { note: `GitHub push failed: ${msg}`, pushed: false };
  }
}
