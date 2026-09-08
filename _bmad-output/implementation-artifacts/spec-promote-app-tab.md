---
title: 'Promote to App tab'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Winston has a plan, there is no way to commit that idea as an app with a real folder and GitHub repo, or to find it later on its own tab.

**Approach:** On Winston replies, show **Promote to an app**. Winston collects an absolute local path and a GitHub repo, writes a charter into that folder, optionally attaches/creates the repo with `gh`, then lists the app on a new **App** tab with Get started. Slash app-team agents and code generation are out of this slice.

</frozen-after-approval>

## Implementation Notes

- Sidebar tabs: Chat | Idea | App | History. App tab lists `AppRecord` rows from SQLite (`apps` table).
- Latest Winston (`agentId === "architect"`) assistant bubble with ≥400 chars of content shows **Promote to an app**. Already-promoted chats show **Open in App tab**.
- Form collects absolute local folder + GitHub `owner/name` or URL → `POST /api/apps` → `promoteToApp()`.
- Writes `START.md`, `APP.md`, `SPEC.md`, `ARCHITECTURE.md`, `BUILD.md` into the folder (those names overwritten). Path: expand `~`, must be absolute, block system prefixes.
- Git/gh: `git init` if needed, `git add` only the five charter files, commit, then `gh repo view` or `gh repo create --private`. Failure does not block promote; status is shown on the App tab.
- Re-promote upserts by idea id or session id. Merging ideas remaps `apps.idea_id`.

## Review Triage Log

- Patch: remap `apps.idea_id` on idea merge; upsert by idea or session; latest-app-for-idea; tighter GitHub URL parse; sidebar “N apps” copy.
- Patch: START.md includes session id; Winston skill copy points at the form, not Winston collecting path; form names the five files and overwrite; drop duplicate ghStatus when already in getStarted; empty copy mentions auto-route; git add only charter files; Promote gated to ≥400 chars.
- Reject: unused `onSelect` on AppWorkspace (sidebar is the list). Streaming bubble without Promote until persist. Four-tab clip (cosmetic).

