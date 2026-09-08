---
title: 'Mobile-responsive left pane'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The left pane (Chat / Idea / History) is `hidden` below the `md` breakpoint, so phones cannot open conversations, start a new chat, or switch tabs.

**Approach:** Keep the desktop sidebar. On small screens, show it as a left drawer opened from a header control, and close it after a selection or backdrop tap.

</frozen-after-approval>

## Implementation Notes

- Desktop (`md+`) keeps a static `w-72` / `lg:w-80` sidebar. Below `md`, the pane is `hidden` until opened as a left drawer (`w-[min(18rem,88vw)]`) with a dimmed backdrop.
- `page.tsx` owns `mobileNavOpen`. Escape, backdrop, close control, session/idea pick, and new conversation all close it. Switching to the Idea tab also closes so the map is visible.
- `MobileNavButton` lives in `IdeaSidebar.tsx` and is used in `ChatWindow` and `IdeaMap` (including the empty map). It is `md:hidden`.
- API key warning keeps an icon on small screens and shows the full sentence from `sm` up.
- Verified at 390px (drawer open/close, History pick, Idea tab) and 1831px (static sidebar, menu hidden).
- After Blind Hunter: menu exposes `aria-expanded`/`aria-controls`; open drawer marks the main column `inert`; backdrop label is distinct; drawer uses `h-dvh` and safe-area padding; API-key chip has `aria-label`.

## Review Triage Log

- Open control missing expanded/controls state — medium, real; patched with `aria-expanded` and `aria-controls="mobile-nav"`.
- Background stays in tab order under the scrim — medium, real; patched with `inert` on the main column while the drawer is open.
- Backdrop and X share the same accessible name — low, real; patched backdrop to "Dismiss conversation menu".
- Missing `dvh` / safe-area on the fixed pane — low, real; patched open drawer with `h-dvh` and bottom safe-area padding.
- API-key icon has `title` but no `aria-label` — medium, real; patched.
- matchMedia only on change, not mount — false; `mobileNavOpen` starts false and is not persisted; resize to `md` already closes the drawer.
- Escape can steal slash-picker dismiss — false; the listener is registered only while the drawer is open, when the input is inert.
- Spec omits md-boundary / landscape checks — deferred; not a product bug.
- `MobileNavButton` lives in the sidebar module — low, rejected; extracting a file would be organizational only.

