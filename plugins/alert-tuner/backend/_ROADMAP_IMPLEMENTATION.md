# Alert AI Tuner — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (Milestones 0, 1, 3 delivered; Milestone 2 publish path deliberately not built).

## Blocked on shared core/module work

1. **Publish milestone (Milestone 2) — approval-gated PR write**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.create` + `vcs.branch.create` (`effect: 'write'`) with `createPullRequest(repoUrl, branch, title, body, files)` on `VcsDriver`. Shared with drift-detector, scaffolder-ai-prd, techdocs-ai-janitor, techdocs-ai-postmortem — build once.
   - Once landed: add the write tool to `ALERT_AI_TUNER_TOOL_IDS`, implement `AlertTunerGraph.resume()` (checkpoint before the gate; `patchApplies()` and `patchHash` already exist and are tested), emit `approval_request` before the write, produce an `AlertTuningPublication` artifact, and audit the decision via `AuditLogSink`.
   - Frontend: un-hide the existing `ApprovalBar`/`PublicationBanner` controls (they render only on real SSE events).

2. **Deploy/scaling correlation**
   - Blocked on `plugin-ai-core-backend-module-kubernetes`: Backstage-aware `KubernetesDiagnosticsDriver` (workload timeline). Absence currently records `DEPLOY_TIMELINE_LIMITATION` and caps `confidence` at `low`.
   - Once landed: add `kubernetes.workload.get_timeline` to the allow-list and wire a correlate-stage collector; remove the standing limitation and lift the confidence cap.

3. **Annotation-based repo resolution**
   - Blocked on `plugin-ai-core-node` `CatalogEntityResolver` consumption: today an explicit `repoUrl` is required; annotation-based resolution reports `anchor_not_found`.
   - Once wired (resolver exists in core-node; needs the `catalogServiceRef` adapter per catalog-ai-insights precedent): resolve the IaC repo from catalog annotations when `repoUrl` is omitted.

## Plugin-local items (no core blocker)

4. **Proposal list endpoint + frontend table** — the frontend's recent-proposal table and entity card need a real backend proposal-list endpoint (query persisted `alert-tuning-proposal` artifacts). If core adds `listArtifacts(filter)` on the runtime store (see tech-radar-ai-manager), use it; otherwise add a plugin-local read route.
5. **Entity card surface** — add the catalog entity-card extension once item 4 exists.
6. **Browser approval tests / Playwright E2E** — blocked on item 1's real approval/publication events, then add `yarn test:e2e:alert-ai-tuner`.
