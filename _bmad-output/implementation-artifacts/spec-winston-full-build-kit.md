---
title: 'Winston full build kit'
type: 'feature'
created: '2026-09-08'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Users want one agent who turns a thread into everything needed to open a blank Cursor folder and start building. Today `/winston` only chats about stack/hosting, and Idea Forge never writes take-away files.

**Approach:** Make Winston the planner-architect-dev-handoff agent. `/winston` (aliases `/plan`, `/kit`) produces a full markdown kit from the conversation — spec, UX, architecture, build/install — and an **App plan ready** control downloads those files as a zip. Winston does not implement the product inside Idea Forge. John stays a lighter PM chat.

## Boundaries & Constraints

**Always:**
- Kit is markdown files a new Cursor window can follow: `START.md`, `SPEC.md`, `DESIGN.md`, `EXPERIENCE.md`, `ARCHITECTURE.md`, `BUILD.md`.
- `START.md` is the paste-in prompt: follow these files, install BMAD in the **new** repo, then build.
- `BUILD.md` covers MVP cut, web/mobile/both, hosting, story-sized build order, and BMAD install notes — not application source code.
- Download works from a completed Winston reply (including after reload). Empty or unparseable kit: button disabled with a short reason.
- Winston stays out of the default four-agent panel.

**Never:**
- Do not run BMAD file workflows (`uv`, `_bmad-output` writes, menus) inside Idea Forge.
- Do not concatenate the full PRD/UX/architecture SKILL.md files into the system prompt (too large). Use a compact kit brief instead.
- Do not add a new npm zip library if a small in-repo zip helper suffices.
- Do not code the user’s product in this repo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | `/winston` (or `/plan`/`/kit`) on a thread with an idea | Winston streams a kit; **App plan ready** downloads a zip of the six `.md` files | N/A |
| Slash only | `/winston` with no body, prior idea in thread | Kit uses conversation history as the product | Same as today: fall back to thread topic |
| Missing fences | Reply has no parseable file blocks | Chat still shows the reply; download disabled: “Kit files not found in this reply” | No zip |
| No API key | Winston invoked without `CURSOR_API_KEY` | Fallback still emits the six file fences (generic kit) so download works | N/A |
| Not Winston | Other agents’ replies | No App plan ready button | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/bmad/agents.ts` — Widen Winston description/persona to planner + architect + dev handoff. Keep `id: architect`.
- `src/lib/bmad/load-skill.ts` — Winston kit brief + required fence format (`<!-- file: NAME.md -->` … `<!-- /file -->`). Do not load full `bmad-prd`/`bmad-ux`/`bmad-architecture` SKILL.md. Keep John’s existing lighter Plan format.
- `src/lib/slash-commands.ts` — Aliases `plan` and `kit` → `architect`. Hints can stay `/winston` only.
- `src/lib/agent-router.ts` — Add kit/spec/ux signals to Winston’s existing planner-lead (already skips party-mode when Winston is top).
- `src/lib/cursor-agent.ts` / `src/lib/message-utils.ts` — Fallback and casual copy emit the six fences + how to download.
- `src/lib/build-kit.ts` *(new)* — `parseBuildKit(content)` → `{ name, body }[]`; only allow the six names; `zipBuildKit(files)` returns a `Blob`/`Uint8Array` with a tiny in-repo zip writer.
- `src/components/BuildKitBar.tsx` *(new)* — **App plan ready** download; same visual weight as `ForgeActionBar` in `src/components/AssistantMessage.tsx`.
- `src/components/ChatWindow.tsx` — Show `BuildKitBar` on Winston assistant turns (stream complete + history). Parse `content`; do not add a DB column.
- `src/app/api/chat/route.ts` — No schema change. Do not attach forge-only behavior to Winston beyond existing flags.
- Do not change `PANEL_AGENTS` or John except where Winston’s router weight would steal `/john`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/bmad/load-skill.ts` + `agents.ts` + `slash-commands.ts` + `agent-router.ts` — Winston is the kit agent with compact instructions and `/plan` `/kit`.
- [ ] `src/lib/build-kit.ts` — Parse fences; zip the six files; reject other names.
- [ ] `src/lib/cursor-agent.ts` + `src/lib/message-utils.ts` — Fallback/casual include fences so download works without an API key.
- [ ] `src/components/BuildKitBar.tsx` + `ChatWindow.tsx` — App plan ready on Winston replies; disabled + reason when parse fails.
- [ ] Verify in the browser: `/winston` chip, complete reply, zip opens with the six markdown files; a Maya reply has no button.

**Acceptance Criteria:**
- Given a thread about an app, when the user sends `/winston` or `/plan`, then the reply contains the six named file fences covering spec, UX, architecture, and how to start in a new Cursor folder (including BMAD in the new repo).
- Given that reply, when they click **App plan ready**, then a zip downloads whose members are exactly those `.md` files.
- Given a non-Winston reply, when they view the turn, then there is no App plan ready control.
- Given Winston is the top auto-route for “write the spec and architecture”, when the message also mentions users, then party-mode does not replace Winston.

## Implementation Notes

## Spec Change Log

## Review Triage Log
