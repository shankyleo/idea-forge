---
title: 'Ideas and Apps tabs only'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four tabs (Chat, Idea, App, History) crowd the nav. Idea map and History are extra surfaces; the user wants two modes only.

**Approach:** Keep two tabs labeled **Ideas** (today’s Chat: conversations + BMAD chat) and **Apps** (promoted apps). Remove the Idea map tab and History tab from the UI. Do not delete idea/session data.

</frozen-after-approval>

## Implementation Notes

- Tab labels: **Ideas** (internal id `chat`) and **Apps** (`app`). Shorter than “Idea Chat” / “App Chat”; matches existing product language.
- Removed Idea map and History from the nav. Idea graph component left in the repo unused. Conversation list on Ideas is still the idea list (unchanged from Chat). History’s session log is no longer in the UI.
- Copy: “Open in Apps”; empty Apps state says “In Ideas…”.
- `handleSelectIdea` now sets `activeIdeaId` so the Ideas list highlights the open conversation.
- Review patches: `loadSidebar` only fetches ideas; tablist/tab roles; sidebar open/close labels are not “conversations” on Apps.

## Review Triage Log

- false: Winston catalog overclaim — from the prior App-tab slice, not this nav change.
- medium/patch: `loadSidebar` still fetched unused `/api/sessions` — removed the sessions request.
- false: flattened idea groups — Chat already flattened groups; the map tab was the only cluster UI, and the user asked to remove it.
- medium/defer: sessions with no idea row cannot be reopened — Ideas still uses the Chat idea list; recorded in deferred-work.
- low/patch: tabs were not a tablist; chrome said “conversations” on Apps — added tab roles and sidebar labels.
- defer: promote-app spec still lists four tabs — docs drift on a done spec.
- defer: unused `AppWorkspace.onSelect` — leftover from the App-tab slice.
- defer: 400-character Promote gate and streaming bubble — leftover from the App-tab slice.
- defer: Open source chat clears `activeIdeaId` — pre-existing session select behavior.
- defer: promote overwrite/`gh` confirmation — leftover from the App-tab slice.

