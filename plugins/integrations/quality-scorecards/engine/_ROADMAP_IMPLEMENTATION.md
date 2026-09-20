# Quality Scorecards Module — Aggregated Roadmap Items

## 1. Scorecard fact/score write op

- **Gap**: `QualityScorecardsDriver` exposes only `getEntityScorecard(entityRef)` (read) and `submitRadarProposal(input)` (write, tech-radar concern).
- **Build**: add `publishScorecardFact(entityRef, fact)`-style driver op + `quality.scorecard.publish_fact` tool (`effect: 'write'`, approval-gated).
- **Blocked consumer**: tech-debt-ai-scout ("update a component's Tech Debt health score"). Do not repurpose `submitRadarProposal` — that corrupts tech-radar-ai-manager's radar.

## 2. Durable TechRadar proposals (lives in the techradar companion module)

- **Gap**: the `TechRadarDriver` proposal store is `Map`-backed/in-memory — lost on restart, never persisted to `techRadar.url`.
- **Build**: durable storage (a table, or a PR against the radar source via the future `vcs.pull_request.create`) and honor `techRadar.url`.
- **Blocked consumer**: tech-radar-ai-manager. Until then it records `proposalId` + a `proposal_not_durable` limitation and never presents submission as durable.
