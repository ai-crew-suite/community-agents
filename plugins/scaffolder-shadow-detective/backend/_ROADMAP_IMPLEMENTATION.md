# Scaffolder AI Shadow Detective — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (reconciliation graph; one hard gate on cloud tooling).

## Blocked on shared core/module work

1. **Cloud inventory tools (Milestone 0, cannot be worked around)**
   - Hard gate in `plugin-ai-core-backend-module-cloud-providers`: `createCloudProviderTools` registers LangChain-shaped `{ name: '<provider>_lookup_resource', execute }` objects as `any[]` — no `id`, no `invoke`, no `effect`, so AI Core's `Tool` contract cannot resolve or invoke them and the agent allow-list cannot reference `cloud.*` IDs.
   - Normalize the module to real `ToolDefinition`s: `cloud.account.lookup`, `cloud.resource.lookup`, `cloud.resource.dependencies`, all `effect: 'read'` with `invoke`. Driver ops (`lookupAccount`, `lookupResource`, `resourceDependencies`) are already correctly shaped and read-only.
   - Same gate as scaffolder-ai-drift-detector cloud reconciliation — build once.

2. **Outreach channel resolution**
   - `communication.channel.lookup` exists (`effect: 'read'`); resolve the inferred `Group` to a channel before outreach; unresolvable → outreach `skipped` with a reason. Actual message posting (`communication.message.post`) stays approval-gated when added.

## Plugin-local items (no core blocker)

3. **Approval-gated outreach** — implement `ReconciliationGraph.resume()`; checkpoint the frozen outreach plan; audit decision, actor, and fingerprints notified.
4. **Dedupe ledger + scan cursor** — track per-fingerprint outreach state and the in-flight scan cursor via AI Core runtime stores; do not hand-roll a bespoke dedupe table.
5. **Scheduled scans** — in-module weekly cadence (Sunday 02:00 per foundation doc), opt-in, globally mutexed; scheduler tests with fast-forwarded ticks.
