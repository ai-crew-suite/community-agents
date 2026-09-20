# Catalog AI Insights — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (backend + frontend delivered; v1 read-only).

## Blocked on shared core/module work

1. **Slack dispatch of scan findings (v1.1)**
   - Needs `communication.message.post` (`effect: 'write'`) from `plugin-ai-core-backend-module-communication`, exercised behind AI Core approval policy and explicit config opt-in. Out of scope for v1 by design; do not fabricate.
   - When built: nightly scan emits an `approval_request`; approved runs post the digest; decision is audit-logged.

## Plugin-local items (no core blocker)

2. **Model-driven insight synthesis hardening** — `insight.synthesize` already calls the model with strict JSON output and citation rules; remaining work is the opt-in real-model evaluation suite (grounding: citations resolve to supplied ctx IDs; no fabricated links/names) within budget, per Milestone 4.
3. **Production readiness (Milestone 4)** — document model registration, driver configuration, scan enablement, permissions; dashboards/alerts for failed runs, degraded-source rate, scan duration, model cost; staged rollout with scans disabled by default.
4. **Playwright E2E (Milestone 3 tail)** — extend the E2E fixture profile and add the insights scenario with screenshot review (`yarn test:e2e:catalog-ai-insights`).
