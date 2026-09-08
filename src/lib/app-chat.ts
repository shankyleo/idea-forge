import type { AppRecord } from "@/lib/types";

export function appKickoffMessage(app: AppRecord): string {
  const gh = app.githubRepo
    ? `GitHub: https://github.com/${app.githubRepo}`
    : "GitHub is not set yet.";
  return `/amelia Get started.

Work in this folder: ${app.localPath}
${gh}

Read START.md, SPEC.md, ARCHITECTURE.md, and BUILD.md in that folder. Follow those files and start the MVP. Write and edit the app source in that folder — not in the Idea Forge repo unless this folder is that repo.

When the app can run, start it yourself (install deps if needed, then start the dev server). Do not tell me to run npm run dev — you start it, wait until it is up, then give me the working URL. Never use port 43123; that is Idea Forge.`;
}

export function appBuildThisMessage(): string {
  return `/amelia Build this.

Implement the change the team just agreed in this thread. Follow the latest discussion. Write and edit code in the app folder. Do not expand scope past what was decided.`;
}

export function rewriteAppPreviewHref(
  href: string | undefined,
  previewUrl?: string
): string | undefined {
  if (!href || !previewUrl) return href;
  try {
    const target = new URL(href, previewUrl);
    if (target.hostname === "localhost" || target.hostname === "127.0.0.1") {
      const preview = new URL(previewUrl);
      target.protocol = preview.protocol;
      target.hostname = preview.hostname;
      target.port = preview.port;
      return target.toString();
    }
  } catch {
    return href;
  }
  return href;
}

