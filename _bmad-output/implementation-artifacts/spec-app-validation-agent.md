---
title: 'App validation agent'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '12691602c272480b034d44d184946ff81a69edd3'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Amelia can ship a change that boots but still breaks the first user action (e.g. Start a story). Apps chat has no check after she writes code, so the founder finds the break by using the app.

**Approach:** After Amelia finishes a build turn, Tess (QA) validates the running preview — homepage plus the primary CTA. If it is broken, Amelia fixes in the same turn, Tess re-checks, up to two fix rounds. `/tess` re-runs validation without a new build.

## Boundaries & Constraints

**Always:**
- Auto-run Tess only after an Apps-chat Amelia turn (`agentId === "developer"`), then after each in-turn fix.
- Same SSE request; extra assistant bubbles for Tess and any fix Amelia (not one fused message).
- Tess's pass/fail is deterministic HTTP (not a second long Cursor coding run). Her bubble is a short report from that result.
- Tess may read the app folder and hit the preview over HTTP. She does not write product source.
- Only Amelia writes/edits application source during the loop.
- Validation: preview must serve; homepage must not be a Next/error overlay; follow the primary homepage CTA (same method/action as the button) and load the next page the same way.
- Cap: 2 Amelia fix rounds after the first Tess fail. If still broken, Tess reports what remains; do not loop forever.
- Ideas tab unchanged. Discussion turns still do not start preview or Tess.

**Never:**
- Playwright / headed browser in v1 (HTTP follow + error-page detection).
- Validating discussion replies, casual chats, or Ideas.
- Expanding scope past the failed check during a fix round.
- Changing GitHub, promote, or folder-picker flows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build pass | Amelia done, preview up, homepage + CTA ok | Amelia bubble, then Tess pass, then Open app as today | N/A |
| CTA broken | Preview up, CTA/next page errors | Tess fail with repro; Amelia fix; Tess re-check | After 2 failed fixes, Tess stops and lists remaining break |
| Preview down | `ensureAppPreview` errors | Tess fail: cannot start; Amelia tries to start/fix; Tess re-check | Same 2-round cap |
| `/tess` | Slash, no new Amelia build | Tess runs against current preview/folder | If no preview, start it first; do not invent a build |
| Discussion | Feedback/question | John/Sally/Winston only — no Tess | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/chat/route.ts` (~363–376) — after Amelia, `ensureAppPreview`; hook validation loop here. `maxDuration` 300. Amelia already uses up to `CURSOR_TIMEOUT_MS` 180s idle plus preview spawn (60s, optional `npm install` 180s). Do not run a second long Cursor Tess; do not run panel on internal fix turns. Skip a second Amelia fix round if remaining time is tight.
- `src/components/ChatWindow.tsx` — SSE handles one `done` → one assistant (`~482–509`). Add an `assistant` (or equivalent) event to commit Amelia, then stream Tess/fix. `groupIntoTurns` already renders orphan assistants (`~45–56`).
- `src/lib/app-preview.ts` — port-open only (`net.connect`), not HTTP health. Keep as start. New `src/lib/app-validate.ts` for HTTP GET, overlay detect, primary-CTA follow.
- `src/lib/types.ts` `BmadAgentId`, `src/lib/bmad/agents.ts` `APP_TEAM_IDS`, `src/lib/slash-commands.ts` `APP_SLASH_HINTS` + aliases, `src/lib/bmad/load-skill.ts`, `src/lib/cursor-agent.ts` fallback `Record`, `src/lib/message-utils.ts` `casualReply`, `src/components/AgentFace.tsx` + `src/app/globals.css` face, `src/app/page.tsx` Ideas filter (exclude Tess like Amelia).
- New short skill `.agents/skills/idea-forge-validator/SKILL.md` — discuss/report only; no BMAD menus.
- Reuse: `streamAgentResponse` with `workspaceCwd` for Amelia fixes only; Tess uses prompt + HTTP helpers, `workspaceCwd` optional read-only.
- Do not change Ideas routing, honesty, promote, or `routeAppMessage` discussion defaults.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/types.ts` + `src/lib/bmad/agents.ts` + slash/face/css/load-skill/fallbacks — add Tess (`validator`) to the Apps team.
- [x] `src/lib/app-validate.ts` — fetch preview, flag error overlays/5xx, find and follow primary CTA, return pass/fail + repro text. Tess's bubble is written from this result (template or a short 30s summary), not a full coding agent.
- [x] `src/app/api/chat/route.ts` — after Amelia preview: Tess → maybe Amelia fix → Tess, max 2 fixes; persist each assistant message; emit commit events before the next speaker.
- [x] `src/components/ChatWindow.tsx` — apply commit events so Tess/fix bubbles appear live; `/tess` in Apps slash; copy mentions Tess after Amelia.
- [x] `.agents/skills/idea-forge-validator/SKILL.md` — Tess validates, reports, does not code.

**Acceptance Criteria:**
- Given Amelia finishes a build in Apps chat, when the preview is healthy and the homepage CTA succeeds, then Tess posts a pass bubble and preview still opens.
- Given the homepage CTA fails (5xx, error overlay, or failed follow), when Tess runs, then Amelia is asked to fix that break in-thread and Tess runs again, at most twice.
- Given the user types `/tess` in Apps chat, when no build was requested, then Tess validates the current preview and Amelia does not start a new feature.
- Given an Ideas message or Apps discussion (not Amelia), when the turn completes, then Tess does not run.

## Implementation Notes

- Tess pass/fail is `validateAppPreview` HTTP (homepage + form/CTA follow). Chat route commits Amelia via `assistant` SSE, then Tess; Amelia fix rounds use `allowAmeliaFixLoop` (developer only) and `canAffordAmeliaFix`.
- `/tess` enters the same validation loop with fixes off (`shouldValidateAppTurn` + `allowAmeliaFixLoop`).
- CTA POST sends hidden fields (`application/x-www-form-urlencoded`). Next.js server actions without a normal `action` URL may still 200 the homepage — v1 does not send `Next-Action` flight headers.

## Spec Change Log

## Review Triage Log

- `false` — `/tess` still hits Cursor (`route.ts` ~348): `else if (agentId !== "validator")` skips `streamAgentResponse`; Tess is HTTP only.
- `false` — persist then `saveMessage` double-writes Tess: Amelia uses `assistantMsgId`; final Tess uses a new `tessMsgId` that was not `persistAssistant`'d.
- `false` — `assistant` SSE drops perspectives: Apps Amelia skips the panel; Ideas never uses `persistAssistant`.
- `false` — `done` `showForgeActions` vs `lastSaveAgent`: Apps sets `showForgeActions` false (`!isAppChat`).
- `false` — first form is not the labeled CTA: Design Notes say first form/button; matches.
- `false` — 200 same-page after CTA is a false pass: v1 is HTTP follow; Implementation Notes already accept missing `Next-Action`.
- `false` — Tess skill omits HTTP procedure: `/tess` does not run Cursor; `formatTessReport` writes the bubble.
- `false` — Amelia fix lacks file pointer: fix run has `workspaceCwd` on the app folder.
- `medium` — `validateAppPreview` passes when `findPrimaryCta` is null (`app-validate.ts` after homepage ok): Tess reports healthy with no first action to follow.
- `medium` — `fetchPage` treats 4xx as ok (only `status >= 500` fails): a 404 CTA/next page can Pass.
- `medium` — CTA fetch has no timeout: a hung preview can block the chat until `maxDuration`.
- `medium` — off-origin CTA href is followed: Tess can request a non-preview URL.
- `medium` — Amelia fix `streamAgentResponse` uncaught: throw skips re-check and hits the outer error path.
- `low` — `formBody` skips textarea/select: rejected (extra parsers; MVP CTA is submit/hidden).
- `low` — GET forms omit query fields: rejected (extra branches; primary CTA is POST).
- `low` — overlay substring false positives: rejected (markers match Next overlays; marketing collision is rare).
- `low` — empty `assistant` SSE skipped in ChatWindow: rejected (empty Tess/fix is not a real report).
- `low` — `shouldRunTessAfterTurn` unused: duplicate of `allowAmeliaFixLoop`; delete in patch.
- `low` — `type=button` counts as submit via `/<button\b/`: default `<button>` is submit; exclude explicit `type=button`.
- `maybe-false` — stale preview after fix (`ensureAppPreview` returns if port open): Next HMR may reload; unverified medium. Defer.
- `low` — port-open/HTTP-not-ready race: rejected (extra retry loop; fail already sends Amelia to start).
- `low` — mockFetch ignores redirects: rejected (Node fetch `redirect: "follow"` is production).
- `medium` (gap, pre-verified) — `app-validate.test.ts` is not on `package.json` / spec Verification (only `tsc`).
- `medium` (gap, pre-verified) — chat Tess loop untested in `route.ts`. Disposition defer.
- `medium` (gap, pre-verified) — ChatWindow `assistant` commit untested. Disposition defer.
- `low` (gap, pre-verified) — Ideas `/tess` slash-null untested. Extract predicate and assert in the existing test file.

## Design Notes

SSE shape (server → client), then reset `streamingContent` for the next speaker:

```
{ type: "assistant", id, agentId, content, routeReason }
{ type: "status", message: "Tess is checking the app…" }
{ type: "chunk", content: "…" }  // Tess
```

Primary CTA: first obvious submit/button on `/` (e.g. "Start your story" form POST). Follow redirects. Fail if HTML looks like a Next error overlay or the status is >= 500.

Chat budget: Tess HTTP is seconds. One Amelia fix in the same request is the expensive part. Prefer one fix round when the clock is low; never start a fix if it would blow `maxDuration`.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: clean
- `npm run test:app-validate` — expected: pass

**Manual checks (if no CLI):**
- Apps: Get started / Build this → Amelia, then Tess pass or fail+fix (not Amelia-only).
- Apps: a question → discussion only, no Tess.
- Ideas: unchanged panel + Attack this.
- `/tess` → Tess only.
- Do not click native Browse in automation.
