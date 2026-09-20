# RFC/ADR AI Reviewer — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (parallel two-node review delivered draft-only; two hard gates recorded).

## Blocked on shared core/module work

1. **PR comment write (approval-gated)**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.comment` (**new**, `effect: 'write'`) with `commentOnPullRequest(repoUrl, prId, body)` on `VcsDriver`. **Blocking for the write milestone.**
   - Once landed: emit `approval_request` before commenting, checkpoint, implement `ReviewGraph.resume()` to post or finalize, audit the decision. Event-triggered runs stay paused at the gate until approved.

2. **Per-node token streaming (UI nicety)**
   - Blocked on `plugin-ai-core-node/src/@types/run.ts`: add optional `node?: string` to the `token` event data (backward compatible; `step` events already carry `node`). Specified by this plan and scaffolder-ai-prd; not yet shipped. Blocking for per-node token UI only, not the workflow.

3. **Event-trigger ingestion**
   - Blocked on AI Core consuming `coreServices.events` (`EventsService`). Today AI Core uses generic triggers + run routes. When it lands, subscribe in-module and translate matching repo/scaffolder events into authenticated run dispatches; do not add a bespoke endpoint.

4. **Catalog entity validation depth**
   - `CatalogEntityResolver` exists in `plugin-ai-core-node/src/catalog/`; remaining work is consuming it in the architecture node to check existence/lifecycle (e.g. `deprecated`) of referenced entities.

## Plugin-local items (no core blocker)

5. **PR changed-files read (if needed)** — if PR listing proves insufficient to locate the changed doc, add a generic changed-files read op to `VcsDriver` (read, additive) rather than plugin-specific hacks.
6. **Status-check posture** — keep v1 advisory (never a hard-failing required check); document the advisory boundary.
