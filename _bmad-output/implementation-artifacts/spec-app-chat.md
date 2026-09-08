---
title: 'App chat and Get started'
type: 'feature'
created: '2026-09-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Apps is a static summary, not a place to build. The user needs each app to be its own chat, with a build team, and a Get started button once a folder exists.

**Approach:** Each app owns a dedicated chat session. The Apps tab is that chat. Slash team is Winston, John, Sally, and Amelia. When a folder is set and the thread is empty, show Get started — it asks Amelia to follow the charter and work in that folder.

</frozen-after-approval>

## Implementation Notes

- Each promoted app owns a dedicated chat session (`session_id`); the Ideas thread is `source_session_id`.
- Apps tab renders `ChatWindow` with Winston, John, Sally, and Amelia.
- Empty app thread + folder → **Get started** kicks off Amelia in that folder (`workspaceCwd`).
- Ideas chat is unchanged (Promote still lives there).

