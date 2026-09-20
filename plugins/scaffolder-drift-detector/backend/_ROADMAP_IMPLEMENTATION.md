# Scaffolder AI Drift Detector — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (v1 emits `drift-report` only; two hard gates recorded).

## Blocked on shared core/module work

1. **Cloud live-topology reconciliation**
   - Blocked on `plugin-ai-core-backend-module-cloud-providers` normalization: `createCloudProviderTools` emits LangChain-shaped `{ name, execute }` objects (provider-prefixed, no `id`/`invoke`/`effect`). Normalize to `ToolDefinition` (`cloud.account.lookup`, `cloud.resource.lookup`, `cloud.resource.dependencies`, `effect: 'read'`, `invoke`) and add any read ops needed for topology capture. **Blocking for cloud reconciliation.** Shared hard gate with scaffolder-ai-shadow-detective — build once.

2. **Remediation PR (write)**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.create` (`effect: 'write'`). **Blocking for the remediate milestone.** Shared with four other plugins — build once.
   - Once landed: emit `approval_request` before the PR, checkpoint, `resume()` opens or discards, audit the decision; frontend gains the patch preview and approve/reject controls (currently not fabricated).

3. **Scaffolder blueprint/provenance reader**
   - Blocked on `plugin-ai-core-node/src/scaffolder/` (unbuilt): bounded `getComponentBlueprint`/template-spec read shared with other scaffolder-* plugins. Adapter here reads the catalog entity's scaffold provenance + template source.

4. **Kubernetes live topology**
   - Same `plugin-ai-core-backend-module-kubernetes` gate as the responder; do not duplicate.

5. **Owner notification (v1.1)**
   - `communication.message.post` to the component owner, behind approval; v1 surfaces drift via dashboard/artifact only.

## Plugin-local items (no core blocker)

6. **Fleet dashboard / drift history API** — the frontend intentionally has no fleet list; add a persisted drift-state read path. Prefer a core `listArtifacts(filter)` (see tech-radar-ai-manager) over a bespoke table; per-component drift state already rides run/checkpoint records.
