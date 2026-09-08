import { spawn, spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { getApp, updateAppPreview } from "@/lib/db";

const FORGE_PORT = 43123;
const PORT_BASE = 43200;

function portForApp(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * 17) % 80;
  }
  return PORT_BASE + hash;
}

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(700, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return isPortOpen(port);
}

function npmBin(): string {
  for (const candidate of ["/usr/local/bin/npm", "/opt/homebrew/bin/npm"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "npm";
}

function previewPath(): string {
  return ["/usr/local/bin", "/opt/homebrew/bin", process.env.PATH || "/usr/bin:/bin"].join(":");
}

function hasDevScript(localPath: string): boolean {
  const pkgPath = path.join(localPath, "package.json");
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.dev || pkg.scripts?.start);
  } catch {
    return false;
  }
}

export async function ensureAppPreview(
  appId: string
): Promise<{ url: string; port: number } | { error: string }> {
  const app = getApp(appId);
  if (!app) return { error: "App not found" };
  if (!hasDevScript(app.localPath)) {
    return { error: "No npm dev script in this folder yet." };
  }

  const port =
    app.previewPort && app.previewPort !== FORGE_PORT ? app.previewPort : portForApp(app.id);

  if (await isPortOpen(port)) {
    const url = `http://localhost:${port}`;
    updateAppPreview(app.id, { previewUrl: url, previewPort: port });
    return { url, port };
  }

  const nodeModules = path.join(app.localPath, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    spawnSync(npmBin(), ["install"], {
      cwd: app.localPath,
      env: { ...process.env, PATH: previewPath() },
      encoding: "utf8",
      timeout: 180_000,
      stdio: "ignore",
    });
  }

  const child = spawn(npmBin(), ["run", "dev", "--", "--port", String(port)], {
    cwd: app.localPath,
    env: {
      ...process.env,
      PATH: previewPath(),
      PORT: String(port),
      BROWSER: "none",
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const ready = await waitForPort(port, 60_000);
  if (!ready) {
    return { error: "The app server did not come up on time." };
  }

  const url = `http://localhost:${port}`;
  updateAppPreview(app.id, { previewUrl: url, previewPort: port });
  return { url, port };
}
