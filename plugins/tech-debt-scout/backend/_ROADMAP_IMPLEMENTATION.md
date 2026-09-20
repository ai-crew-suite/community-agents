# Tech Debt AI Scout — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (sweep + reporter graph; ticket writes confirmed available; one genuine write gap).

## Blocked on shared core/module work

1. **Scorecard debt-score publish (the one genuine write gap)**
   - `plugin-ai-core-backend-module-quality-scorecards`: `QualityScorecardsDriver` has only `getEntityScorecard` (read) and `submitRadarProposal` (a tech-radar concern). Add a `publishScorecardFact(entityRef, fact)`-style driver op plus a `quality.scorecard.publish_fact` tool (`effect: 'write'`). **Do not** repurpose `submitRadarProposal` for debt scores — that corrupts the radar owned by tech-radar-ai-manager.

2. **VCS search coverage**
   - Real `searchRepository` for Bitbucket/Gerrit/generic Git (shared with tech-radar and search-ai-context) improves sweep target coverage.

## Available now — verify and harden (not blocked)

3. **Ticket filing path** — `project.ticket.create`/`comment` exist (`effect: 'write'`) with `CreateTicketInput { title, description?, team?, labels?, priority?, parentId? }`: the Reporter's primary action is buildable in v1 behind the approval gate. Implement `ScoutGraph.resume()`; checkpoint the frozen ticket plan; audit decision, actor, fingerprints filed.
4. **Sweep targeting** — build the target list from `CatalogEntityResolver` (`findByAnnotation`, `getEntitySummary`, `getIntegrationReferences`) and route findings to `owner`; replaces raw annotation parsing.
5. **Fingerprint ledger** — per-fingerprint ticket state via AI Core runtime stores; no bespoke dedupe table. Weekly cadence (Sunday midnight), opt-in, globally mutexed.
