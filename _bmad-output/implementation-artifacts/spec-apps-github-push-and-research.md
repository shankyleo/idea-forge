---
title: 'Apps stack research and GitHub push on build'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '140f688feecbd8d93912dfc4d923380afed0dbbf'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Apps discussion can recommend stale APIs (for example DALL·E) because John and Winston never get live research. After a GitHub repo is attached, Amelia’s files stay local until someone pushes by hand.

**Approach:** When John or Winston is the Apps lead, run technical stack/API recon and inject it into their prompts (and the Apps panel) before Amelia. After Amelia’s build turn, if GitHub is attached, commit and push the app folder.

**Decisions:** No Mary on the Apps team — status line plus prompt inject only. Research on John and Winston leads (including `/john` `/winston`), not Sally-only, Amelia, Tess, or casual. Push after the Amelia+Tess loop whether Tess passed or failed. Skip push when `githubRepo` is empty. Never force-push.

## Boundaries & Constraints

**Always:** Ideas `runDeepRecon` / Mary / slash research stay unchanged. Apps research is a separate technical recon. Push only with `githubRepo` set, only `git push` (no `--force`). Respect `.gitignore`; never commit `.env*`, `node_modules`, `.next`. Surface push success or failure in the Apps thread. John/Winston must prefer currently available APIs from the research and must not recommend discontinued models.

**Never:** Add Mary/`deep-recon` to the Apps slash team. Run Apps research for Amelia or Tess. Change Ideas promote, attach-time `gh repo create`, or edit-GitHub-after-set. Rewrite git history or update git config.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| John/Winston lead | Apps chat, not casual | Status “Checking current APIs and stack…”, `runAppStackRecon`, `researchBlock` into lead + Apps panel | Empty findings: still reply; prompt says evidence was empty |
| Sally / Amelia / Tess / casual | Those leads | No Apps recon | N/A |
| Ideas research | Ideas chat | Existing market recon only | Unchanged |
| Push after Amelia | `githubRepo` set, dirty tree after Amelia+Tess | Commit + `git push`; chat note with `https://github.com/{repo}` | Push fail: note the error; leave files on disk |
| No GitHub | Amelia done, `githubRepo` empty | No git commit/push | Silent skip |
| Clean tree | GitHub set, nothing to commit | Note “Nothing new to push” | N/A |
| No `.gitignore` | App folder missing one | Write a Node `.gitignore` before `git add -A` | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/chat/route.ts` — `runResearch` is `!isAppChat` (~251). After Amelia+Tess (~430–519) there is no git push. Add Apps recon gate; pass `researchBlock` into `runAppPanelPerspectives` and John/Winston `streamAgentResponse`; call push after the Tess loop when `agentId === "developer"` (or Tess after Amelia already wrote files this turn).
- `src/lib/web-research.ts` — `runDeepRecon` / `extractSearchQueries` are market-only. Add `runAppStackRecon` with queries like current API / discontinued alternative / 2026 docs. Reuse `searchDuckDuckGo`. Do not change Ideas `runDeepRecon`.
- `src/lib/bmad/load-skill.ts` — research overlay (~44–46) asks for market depth. For Apps John/Winston, use stack-availability wording instead.
- `src/lib/panel-agents.ts` — `runAppPanelPerspectives` (~151) has no `researchBlock`. Thread it through `buildAppPanelPrompt`.
- `src/lib/promote-app.ts` — private `run` (~103). Reuse for a new exported `pushAppBuild(localPath, githubRepo, message)` (or sibling `src/lib/app-git-push.ts`). Do not change `promoteToApp` / `attachGithub` create path.
- `src/lib/agent-router.ts` — `routeAppMessage` already sends default feedback to John. No routing change required except tests.
- `src/lib/app-validate.test.ts` — extend for recon gate + gitignore/skip-push helpers. Ideas research tests: none today; do not add market-query churn.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/web-research.ts` -- add `runAppStackRecon` and export query helper -- technical DDG queries, not TAM
- [x] `src/lib/bmad/load-skill.ts` -- Apps planner research overlay prefers current APIs -- stop DALL·E-style stale recs
- [x] `src/lib/panel-agents.ts` -- pass `researchBlock` into Apps panel -- Winston/John cards see the same evidence
- [x] `src/lib/app-git-push.ts` -- commit+push with gitignore guard -- Amelia output reaches GitHub
- [x] `src/app/api/chat/route.ts` -- Apps recon for John/Winston; push after Amelia+Tess -- wire both goals
- [x] `src/lib/app-validate.test.ts` -- unit-test recon gate, stack queries, push skip/gitignore -- cover the matrix

**Acceptance Criteria:**
- Given Apps chat routed to John or Winston, when the user sends a non-casual message, then recon runs and both the lead reply and Apps panel can cite current APIs from that block.
- Given Apps chat routed to Amelia, Sally, Tess, or a casual ping, when the user sends that message, then Apps recon does not run.
- Given Ideas chat, when research runs, then market `runDeepRecon` is unchanged.
- Given an app with `githubRepo` set and Amelia just wrote files, when the Tess loop finishes, then those files are committed and pushed without `--force`.
- Given no `githubRepo` or a clean tree, when Amelia finishes, then there is no force-push and no secret files in the commit.

## Implementation Notes

- Apps recon: `shouldRunAppStackRecon` + `runAppStackRecon` (DDG, current API/docs queries). Status “Checking current APIs and stack…”. Ideas still use `runDeepRecon` only (`else if` so they never mix).
- Apps John/Winston overlay in `load-skill.ts` prefers current APIs; Apps panel gets the same `researchBlock` in `buildAppPanelPrompt`.
- `pushAppBuild` writes Node `.gitignore` if missing, `git add -A`, commit as Amelia via one-shot `-c` identity (no git config write), `git push` without `--force`. Empty `githubRepo` returns a silent empty note. Wired after Amelia+Tess for `developer` turns.
- `npm run test:app-validate` — 22 passed, including matrix rows for recon gate, TAM-vs-stack queries, skip/gitignore, clean tree, and `.env` untracked.
- Review patches: add `origin` when missing; `git push -u origin HEAD`; retry unpushed commits; append missing gitignore lines; catch throws; stub `fetch` for `runAppStackRecon`; local bare remote asserts a real push.

## Spec Change Log

## Review Triage Log

- false — Blind: Tess-led turns never push. `allowAmeliaFixLoop` is developer-only, so `/tess` does not write files; Amelia+Tess already pushes on developer turns.
- false — Blind: `/john` `/winston` skip the Apps panel. Slash already skips the panel; the lead still gets `researchBlock`.
- false — Blind: tests live in `app-validate.test.ts`. That file is what `test:app-validate` runs; location is not a user-facing defect.
- false — Blind: `.env.*` also ignores `.env.example`. Frozen Always is never commit `.env*`.
- false — Edge: empty/whitespace topic yields stub DDG queries. John/Winston recon is skipped for casual; empty Apps pings are not an everyday path.
- false — Edge: `topicMessage` vs `workingMessage`. `topicMessage` is only set in forge mode (`attack this` / `defend this`), not normal Apps discussion.
- false — Edge: `Get started!!` misses the golden commit regex. Everyday Get started / Build this still match.
- false — Other: push note lands on Tess’s saved message. Spec requires a note in the Apps thread, not a specific speaker.
- low — Blind: panel `researchBlock` sliced to 2500 chars. Same cap as Ideas panel; users would not notice. Rejected (not a direct one-line fix).
- low — Blind: queries hardcode 2026. Fine for this year; rejected as non-everyday.
- low — Blind: `execFileSync` can stall POST. Same pattern as attach/promote; Amelia already holds the request. Rejected.
- maybe-false — Blind: already-tracked `.env` stays in the index. gitignore does not untrack; would need `git ls-files` on a real app folder to know if Amelia ever added one.
- medium — Blind/Edge/VG: `githubRepo` is never used to add `origin`. Attach can save `githubRepo` after a failed `gh` push, and `git init` on a folder with no remote always fails the later Amelia push.
- medium — Blind/Edge: after commit + failed push, porcelain is clean so the next turn says “Nothing new to push” and never retries.
- medium — Blind/Edge: existing `.gitignore` is left as-is, so `git add -A` can commit `.env` / `node_modules` / `.next` when those patterns are missing.
- medium — Edge: `pushAppBuild` / `ensureNodeGitignore` can throw (missing path, EACCES); the chat outer catch turns that into a stream error instead of a GitHub note.
- medium — VG (pre-verified): `runAppStackRecon` is never called in tests; swapping it for market queries would still pass the gate/query assertions.
- medium — VG (pre-verified): the temp-repo test treats `GitHub push failed` and `Pushed to …` as the same pass, so deleting `git push` would still go green.

## Design Notes

Apps recon is not Mary. Default Apps lead is already John, so “when the PM is called” is the normal discussion path; `/winston` gets the same block so architecture recs are current before **Build this**.

Push is a backup of Amelia’s tree, not a Tess gate. Tess still reports pass/fail in chat; GitHub gets whatever Amelia wrote that round.

Golden commit: `Amelia: Get started` or `Amelia: {first 72 chars of the user message}`.

## Verification

**Commands:**
- `npm run test:app-validate` -- expected: all tests pass including new recon/push cases

**Manual checks (if no CLI):**
- Apps: ask John about image generation — he should not default to a discontinued DALL·E product if research shows a current alternative.
- Apps with GitHub attached: **Build this** → Amelia → Tess → thread note that the repo was pushed; GitHub shows the new files.
