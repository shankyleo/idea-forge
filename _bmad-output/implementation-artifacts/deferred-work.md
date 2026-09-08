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

