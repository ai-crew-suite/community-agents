# TechDocs AI Janitor — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (detection + patch generation delivered; delivery is mode-configurable around the missing PR write tool).

## Blocked on shared core/module work

1. **Pull-request delivery mode**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.create` (`effect: 'write'`). Shared with alert-ai-tuner, drift-detector, scaffolder-ai-prd, techdocs-ai-postmortem — build once.
   - `deliver.mode: 'pull_request'` is already a **boot-time configuration error** while the tool is unregistered (not a silent downgrade); flip to available once the tool lands. Detection and patch generation are identical across modes.

2. **Event-triggered runs**
   - Deferred on the AI Core events subscription gap (`coreServices.events`); sweep + manual paths cover v1.

## Plugin-local items (no core blocker)

3. **Ticket delivery bridge** — `deliver.mode: 'ticket'` files a patch-carrying ticket via the existing `project.ticket.create` (approval-gated, same idempotency/audit path as PR mode). Verify per-patch partial failure semantics: each file delivered independently with success/skip/failure recorded; no rollback (neither tool exposes delete).
4. **Idempotency verification** — repeated approved resume re-reads the prior `JanitorDeliveryRecord` and skips completed files keyed by `(filePath, patchHash)`; double-approve cannot open two PRs/tickets.
5. **Scheduled sweeps** — optional periodic doc audit, opt-in, mutex-guarded; scheduler tests with fast-forwarded ticks.
6. **Approval gate** — implement `JanitorGraph.resume()`; checkpoint the frozen patch set; audit decision, actor, file paths, and patch hashes.
