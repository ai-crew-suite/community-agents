# Release Notes AI Generator (Frontend)

Standalone Backstage page for starting a release-notes draft run, following its
AI Core SSE stream, replaying a deep-linked run, and reviewing cited,
categorized markdown with transparent internal-chore filtering.

The UI includes the typed approval API surface for the future publishing
milestone. The current backend emits draft artifacts only because no shared
`vcs.release.publish` write tool is registered, so approval controls are not
shown during normal draft-only runs.
