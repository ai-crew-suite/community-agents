# Release Notes AI Generator (Backend)

This AI Core module turns a bounded set of merged pull requests for one
repository into a cited, customer-facing release-notes **draft**.

The current VCS shared contract has no `vcs.release.publish` write tool. The
module therefore intentionally stops after emitting `release-notes-draft`; it
never emits an approval request or attempts publication. The approval/resume
milestone must be enabled only after the provider-neutral VCS publish contract
and write tool are implemented in AI Core.
