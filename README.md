# Idea Forge

A BMAD-powered thinking companion that helps you brainstorm, research, pressure-test, and connect app ideas — with optional dimensional honesty analysis via the Honesty Coach agent.

**Repository:** https://github.com/shankyleo/idea-forge

Cloud Agents should open this GitHub repo (not the Cursor tmp repo). Add `GITHUB_TOKEN` (repo scope) and `CURSOR_API_KEY` as environment secrets for push + live agents.

## Features

- **Auto-routing BMAD agents** — type anything; the app picks Deep Recon, Forge, Honesty Coach, Party Mode, etc.
- **BMAD agents** — Deep Recon, Forge, Carson, Red Team, Maya, Victor, Dr. Quinn, Party Mode, **Honesty Coach**
- **Honesty Coach** — Six-dimension breakdown (evidence, specificity, assumptions, feasibility, market awareness, confidence calibration). No single overall score. Routed automatically when your message has bold claims.
- **Deep Recon** — Live web search with idea depth score (competition, market signals, go/no-go guidance)
- **Idea vault** — Ideas are auto-captured from chat and linked when related
- **Cursor API** — Live agent responses via `@cursor/sdk` when `CURSOR_API_KEY` is set
- **Demo mode** — Works without an API key using structured BMAD-guided fallback responses

## Prerequisites

- Node.js 22+
- [Cursor API key](https://cursor.com/dashboard/api) (optional but recommended for full agent responses)

## Setup

```bash
npm install
# Optional: create .env.local and add CURSOR_API_KEY for live agents
npm run dev
```

Open [http://localhost:43123](http://localhost:43123).

On Apple Silicon, if `npm install` fails on `@next/swc-darwin-x64`, use `npm install --force`.

## Start, stop, restart

The app listens on port **43123**.

| Action | Command | Notes |
|--------|---------|--------|
| **Start** | `npm run dev` | Foreground. Also stop with Ctrl+C. |
| **Stop** | `npm run dev:stop` | Kills the process on port 43123. |
| **Restart** | `npm run dev:restart` | Stop, then start. Use after editing `.env.local`. |

```bash
npm run dev          # start
npm run dev:stop     # stop
npm run dev:restart  # restart
```

If you see `EADDRINUSE`, the port is still taken:

```bash
npm run dev:stop
npm run dev
```

### Git push (GitHub)

After `npm install`, a **post-commit hook** pushes `main` to GitHub (`github` remote) and Cursor origin on every commit. Requires `GITHUB_TOKEN` in the environment (Cloud Agent secrets).

Manual push:

```bash
npm run push:github
```

## Cloud Agent setup

1. Create/open Cloud Agent from **https://github.com/shankyleo/idea-forge**
2. Environment secrets: `GITHUB_TOKEN`, `CURSOR_API_KEY`
3. `.cursor/environment.json` installs deps and starts the dev server on port **43123**. Use the same start / stop / restart commands as above.

## BMAD Integration

BMAD skills are installed under `.agents/skills/` (39 skills including CIS and BMad Method). The app loads each agent's `SKILL.md` as the system prompt when calling the Cursor SDK.

Reinstall or update BMAD:

```bash
npx bmad-method install --yes --tools cursor --modules cis,bmm
```

## How honesty scoring works

Each user message is analyzed for:

| Dimension | What it checks |
|-----------|----------------|
| Evidence | Numbers, sources, examples |
| Specificity | Detail level, vague language |
| Assumptions | Absolute claims, untested validation |
| Feasibility | Complexity underestimation, overconfidence |

Scores appear on your messages in the chat. BMAD agents also see the score and gently challenge weak claims.

## Project structure

```
src/
  app/           Next.js routes and API
  components/    Chat UI, agent picker, honesty badge
  lib/
    bmad/        Agent definitions and skill loading
    cursor-agent.ts   Cursor SDK integration
    honesty-scorer.ts Rule-based + context scoring
    db.ts          SQLite idea and session storage
data/            Local SQLite database (gitignored)
.agents/skills/  BMAD skills (installed)
_bmad/           BMAD configuration
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CURSOR_API_KEY` | No | Enables live BMAD agent responses via Cursor SDK |

Without the API key, the app runs in demo mode with structured guidance based on BMAD workflows.
