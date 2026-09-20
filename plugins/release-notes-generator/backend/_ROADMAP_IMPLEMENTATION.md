# Release Notes AI Generator — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (first write-capable workflow in the series; draft path delivered, publish path gated).

## Blocked on shared core/module work

1. **Publish milestone — approval-gated release publishing**
   - Blocked on `plugin-ai-core-backend-module-vcs`:
     - `vcs.release.publish` (**new**, `effect: 'write'`) with `publishRelease(repoUrl, tag, body)` on `VcsDriver` — **hard blocker** for publishing.
     - `vcs.repository.get_release_tags` + `vcs.repository.compare` (**new**, read) for true tag-delta windows; v1 derives the window from PR merge timestamps.
     - Optional: extend `listPullRequests` with a bounded merge-window filter (shared with search-ai-archeology).
   - Once landed: allow-list the write tool, emit `approval_request` before publishing, checkpoint at the gate, implement `resume()` to publish or discard, audit the decision, and emit a `release-notes-publication` artifact.

## Plugin-local items (no core blocker)

2. **Frontend approval surface** — the approval bar and publication banner components are specified; wire them when item 1 emits real `approval_request` events. No UI may imply publication is available before then.
3. **Ticket enrichment robustness** — `project.ticket.get/search` resolution of keys parsed from PR bodies; degrade when no project-management driver is configured (verify coverage).
4. **Scheduled draft runs** — confirm scheduled runs stop at the draft gate and never publish; scheduler tests with fast-forwarded ticks.
