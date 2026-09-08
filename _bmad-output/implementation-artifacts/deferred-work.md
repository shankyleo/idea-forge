- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-mobile-responsive-left-pane.md`
  summary: Add verification coverage for the md breakpoint and landscape phones
  evidence: Blind Hunter noted checks only at 390px and 1831px; extra viewport cases would be spec/docs work, not a user-facing defect in the drawer

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-ideas-apps-tabs.md`
  summary: Resume chats that never got an idea row after History was removed
  evidence: Ideas still lists idea records, not sessions. A new conversation is easy to lose until an idea is extracted. Would be medium if we confirm users relied on History for that.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-ideas-apps-tabs.md`
  summary: Update the promote-app spec copy that still says four tabs
  evidence: Done-spec documentation drift, not a runtime bug.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-ideas-apps-tabs.md`
  summary: In-pane app switcher when the sidebar is collapsed
  evidence: AppWorkspace `onSelect` is unused; leftover from the App tab slice, not this nav change.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-folder-picker-optional-github.md`
  summary: Confirm before overwriting charter files or replacing an existing app row
  evidence: Pre-existing promote behavior; not introduced by Browse/optional GitHub.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-folder-picker-optional-github.md`
  summary: Edit or retry GitHub after it is already set
  evidence: User asked to add GitHub later, not to change it afterward.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-folder-picker-optional-github.md`
  summary: Avoid removing an existing git origin when attaching GitHub
  evidence: Pre-existing attachGithub behavior from the first promote slice.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-app-validation-agent.md`
  summary: Automated test of the Apps chat Tess loop (preview, assistant commits, two-fix cap) in POST /api/chat
  evidence: Helpers are unit-tested; deleting the route loop would still leave those tests green. Closing it needs a mocked POST harness this repo does not have.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-app-validation-agent.md`
  summary: Component test that SSE type assistant then Tess chunks yield two bubbles, not one fused message
  evidence: No ChatWindow test runner; spec already lists manual Apps-chat checks for that contract.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-app-validation-agent.md`
  summary: Restart or wait-for-HTTP when Tess rechecks after an Amelia fix on an already-open preview port
  evidence: maybe-false medium — ensureAppPreview returns if the port is open; Next HMR may already pick up file changes. Settled by watching whether a failed CTA still fails after Amelia writes files without a process restart.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-tess-follow-server-action.md`
  summary: Follow 307/308 redirects with the original POST body instead of always GETting Location
  evidence: Storyboard Start uses 303 See Other. 307/308 POST-preserving hops are unimplemented and untested.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-tess-follow-server-action.md`
  summary: Prefer the labeled Start CTA when another form appears first on the homepage
  evidence: Pre-existing findPrimaryCta takes the first form with a submit control; not introduced by the cookie/multipart follow.

- source_spec: `/Users/shankhasaha/Documents/github/idea-forge/_bmad-output/implementation-artifacts/spec-apps-github-push-and-research.md`
  summary: Untrack a .env that Amelia already committed before this gitignore existed
  evidence: maybe-false medium — gitignore does not remove files already in the index; settle by checking git ls-files for .env in a real app folder after an Amelia turn.



