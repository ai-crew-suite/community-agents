# Scaffolder AI Guardrail Agent — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (advisory negotiation loop delivered; enforcing interception is the known v2 gap).

## Blocked on shared core/module work

1. **v2 enforcement — Scaffolder pre-flight interception**
   - Hard gate: there is no `createTemplateAction` consumer, no `scaffolderActionsExtensionPoint`, and `plugin-ai-core-node/src/scaffolder/` is unbuilt. v1 is advisory (frontend-invoked), and the UI renders the advisory-only limitation persistently until this lands.
   - Build a Scaffolder pre-flight hook (custom action or extension point) that invokes the guardrail evaluation server-side and blocks `scaffold()` on `blocking` verdicts. Until then, never present the page as a server-side gate.

2. **Approver authorization depth**
   - `compliance.permission.check` exists; ensure the OPA driver policies for exception/mutation classes are authored and deployed, and that a developer cannot approve their own over-budget request unless policy permits (refusals are audited).

## Plugin-local items (no core blocker)

3. **Report milestone (Milestone 5)** — bounded, mutex-guarded aggregate report tick; the report must never evaluate or mutate a request; respect `report.enabled: false`; scheduler tests with fast-forwarded ticks.
4. **E2E** — extend the fixture profile with a fixture compliance driver (scripted violations/costs); Playwright accept/reject/blocked scenarios (`yarn test:e2e:scaffolder-ai-guardrail-agent`); assert the accept control is absent on `blocked`.
5. **Production readiness** — document model registration, OPA driver configuration, policy and ladder authoring, approver permissions, and the advisory-vs-enforcing boundary.
