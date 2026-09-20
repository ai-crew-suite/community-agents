# Tech Radar AI Manager — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (sweep, ratios, proposals delivered; delivery honesty gates recorded).

## Blocked on shared core/module work

1. **Durable radar proposal submission (blocking for real radar integration)**
   - `plugin-ai-core-backend-module-quality-scorecards-techradar`: the driver's proposals are `Map`-backed, in-memory only — lost on restart, never persisted to `techRadar.url`. Make storage durable (a table, or a PR against the radar source via the future `vcs.pull_request.create`) and actually use `techRadar.url`. Until then keep recording `proposalId` and attaching the `proposal_not_durable` limitation.

2. **Artifact history for longitudinal observations (recommended core addition)**
   - `plugin-ai-core-backend`/`plugin-ai-core-node`: add `listArtifacts(filter)` to `RunStore`/`ArtifactSink`. Would let this plugin read its own `AdoptionSnapshot` history instead of maintaining a checkpoint-backed rolling series keyed by `observationSeriesId`, and would serve every trend-oriented agent (also oncall brief history, drift fleet views, alert-tuner proposal lists).

3. **PR-time alerts**
   - Deferred on the AI Core events subscription gap (`coreServices.events`); duplicate-capability detection runs in the sweep meanwhile; keep `RadarScanRequest.source` discriminated so an `event` variant is additive.

4. **VCS search coverage**
   - Real `searchRepository` for Bitbucket/Gerrit converts `manifest_unavailable` repos into counted ones, improving ratio representativeness. Shared with search-ai-context and tech-debt-ai-scout.

## Plugin-local items (no core blocker)

5. **Deprecation ticket flow** — `project.ticket.create` exists; one ticket per affected owner, approval-gated, deduped by `(technology, owner, ring)`. Verify the resume/audit path.
6. **Resumable sweeps** — checkpoint the scan pointer and accumulated counters after every repository (interrupted at repo 50/100 resumes without losing counters). Weekly cadence, opt-in, globally mutexed.
7. **Driver-quality honesty** — stub-driver repos stay excluded from denominators; never count `manifest_unavailable` as "not using X".
