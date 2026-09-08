---
title: 'Tess follows Next.js server-action CTAs'
type: 'bugfix'
created: '2026-09-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
baseline_commit: '2c5c76161e9c1699ac1507310c1cfe12de29fbd5'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tess can pass a Next.js App Router homepage whose primary CTA is a server-action form (`action=""`, `$ACTION_ID_*`, multipart). A naïve POST returns 200 on the same homepage, so she never loads the next page — and never sees the 404/500 the founder hits after Start.

**Approach:** When the homepage CTA is a Next server action, Tess submits it the way the browser does, keeps the session cookie, follows the redirect, and fails if the POST did not leave the homepage or the next page is an error/not-found.

</frozen-after-approval>

## Implementation Notes

- Next server-action CTAs (`$ACTION_ID_*` / `$ACTION_REF_*`) are POSTed as `multipart/form-data` with `redirect: "manual"`. Cookies from the homepage GET and the action `Set-Cookie` are sent on the follow GET.
- Same-page 200 after a server-action POST is a Fail (`server action did not navigate`). 303/302 to a 4xx/5xx/overlay page is a Fail. Report includes the landed URL.
- Files: `src/lib/app-validate.ts`, `src/lib/app-validate.test.ts`. Chat route / Tess bubble unchanged — they already consume `validateAppPreview`.
- Live check against the storyboard preview: POST `/` followed to `/project/…/interview` with cookie; Start your story in the browser opens the interview wizard.

## Spec Change Log

## Review Triage Log

- `medium` — homepage GET `Set-Cookie` was not sent on the CTA POST: patched; `home.cookie` is forwarded and covered by a test.
- `medium` — tests did not assert `FormData`: patched; next-action POSTs set `expectFormData`.
- `false` — formBody skips textarea/select: pre-existing v1 parser; primary CTA is hidden `$ACTION_ID` + submit.
- `false` — missing `Next-Action` RSC header: Tess submits the progressive-enhancement form (multipart `$ACTION_ID_*`); live 303 confirms that path. `$ACTION_REF` field names are now treated as server actions too.
- `false` — `samePath` ignores query/hash: still the homepage; Tess should fail.
- `defer` — 307/308 POST-preserving redirects: storyboard Start is 303; recorded in deferred-work.
- `low` rejected — multi-cookie `getSetCookie` untested in the mock: native fetch used `Set-Cookie` successfully in the live check; mock `get("set-cookie")` matches the single-cookie apps we validate.
- `low` rejected — off-origin / missing Location / max-redirects untested: defensive fail paths; adding them would not change the Start-CTA contract.
- `low` — `decodeURIComponent` throw: patched with try/catch.
- `defer` — first homepage form wins: pre-existing `findPrimaryCta`; recorded in deferred-work.
- `false` — live 303+cookie not in CI: unit tests lock that contract; live check is verification.

## Verification

**Commands:**
- `npx tsc --noEmit` — expected: clean
- `npm run test:app-validate` — expected: pass

**Manual checks (if no CLI):**
- Apps `/tess` against a Next server-action homepage: Fail if Start stays on `/` or the next page is 404/500; Pass only after following to the next page with the session cookie.

