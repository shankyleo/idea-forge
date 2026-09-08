---
title: 'Folder picker and optional GitHub'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Promote requires typing an absolute folder path and a GitHub repo up front. Users want to pick the folder in a dialog, and they want to attach GitHub later.

**Approach:** Keep the path field and add a Browse button that opens a native folder picker and fills it. GitHub is optional on promote. If omitted, Apps can attach a repo later.

</frozen-after-approval>

## Implementation Notes

- Browse calls `POST /api/pick-folder`, which opens a native macOS folder dialog via `osascript` and fills the path field. Pasting a path still works. Linux uses zenity if present.
- GitHub is optional on promote. Empty repo skips `gh`; charter is still written and committed locally.
- Apps shows **Attach GitHub** when `githubRepo` is empty (`PATCH /api/apps`).
- Review patches: require a real absolute/`~` path before `path.resolve`; START.md GitHub line uses the full URL on attach; Browse helper text; Winston catalog copy.

## Review Triage Log

- low/patch: Browse dialog runs on the Idea Forge machine — added helper text.
- medium/patch: relative pasted paths were rooted at cwd — now rejected unless absolute or `~`.
- defer: charter overwrite with no confirm — pre-existing promote behavior.
- defer: upsert by idea/session can replace an app — pre-existing.
- medium/patch: Winston catalog still required GitHub — updated.
- defer: cannot change GitHub after it is set — out of this request.
- defer: `git remote remove origin` — pre-existing attach.
- medium/patch: attach wrote `owner/name` into START.md instead of the URL.
- defer: unauthenticated local exec APIs and unused `onSelect` — local-app / leftover.

