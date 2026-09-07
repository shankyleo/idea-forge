# Idea Forge

A BMAD-powered thinking companion that helps you brainstorm, research, pressure-test, and connect app ideas — with an honesty score on every message.

## Features

- **BMAD agents** — Deep Recon (default), Forge, Carson, Red Team, Maya, Victor, Dr. Quinn, Party Mode
- **Honesty scoring** — Every message is scored on evidence, specificity, assumptions, and feasibility
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
cp .env.example .env.local
# Add your CURSOR_API_KEY to .env.local
npm run dev
```

Open [http://localhost:43123](http://localhost:43123).

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
