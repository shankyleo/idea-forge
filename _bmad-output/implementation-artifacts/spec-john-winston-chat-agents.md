---
title: 'John and Winston chat agents'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Idea Forge chat can invoke Maya, Victor, Mary, and the other BMAD personas, but not John (product manager) or Winston (architect), so users cannot ask in-app for an MVP plan, platform choice (web / mobile / both), or a build-and-host plan.

**Approach:** Register John and Winston as first-class chat agents with slash commands (`/john`, `/winston`) that stream a conversational plan, matching the existing Maya-style invoke path. They stay out of the default four-agent party panel. Replies stay in chat; they do not run the file-writing BMAD PRD/architecture workflows.

</frozen-after-approval>

## Implementation Notes

- Registered `product-manager` (John) and `architect` (Winston) on `BmadAgentId`, `BMAD_AGENTS`, slash aliases `/john` `/pm` `/prd` and `/winston` `/architect` `/architecture`, empty-state chips, faces, and fallback copy.
- Skills are the persona files `bmad-agent-pm` and `bmad-agent-architect`. Chat overlay skips menus/files and replaces the default reply format with a **Plan** section (MVP + platform for John; stack + hosting for Winston).
- Left the default four-agent panel unchanged. If John or Winston is the top auto-route hit, skip party-mode so an MVP/hosting ask is not absorbed by Maya/recon.
- Tightened Winston routing: dropped `cloud` / `aws` / `vercel` so phrases like "cloud kitchen" do not steal the turn.
- Verified in the browser: empty state shows `/john` and `/winston`, agent grid lists John (Product manager) and Winston (System architect), chips fill the input, header reads "11 BMAD agents on call". Did not send a live `/john` prompt (browser write blocked).

## Review Triage Log

- medium / real — PRD and architecture workflow skills fight chat: switched to `bmad-agent-pm` / `bmad-agent-architect` and replaced the default reply format for those two.
- medium / real — party-mode swallowed planner leads when a second signal scored ≥ 2: skip multi-agent when top hit is John or Winston.
- low / rejected — aliases missing from picker chips: `/pm` and `/prd` still parse; extra chips would clutter the empty state.
- medium / real — `planBlock` did not override `RESPONSE_FORMAT_INSTRUCTION`: planners now get a Plan-section format.
- low / real — fallback and casual copy too thin: added a generic Plan stub and example `/john` `/winston` prompts.
- medium / real — `cloud`/`aws`/`vercel` stole architect routing: removed those tokens.
- low / real — Winston face had no mouth: added a mouth stroke.
- false — spec missing acceptance checks: oneshot specs omit that section; Implementation Notes record the checks that were run.

