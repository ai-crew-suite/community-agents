# Kubernetes AI Responder — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (exemplar plan for the workflow-runner architecture; v1 read-only investigation).

## Blocked on shared core/module work

1. **Backstage-aware Kubernetes diagnostics (enablement gate)**
   - Blocked on `plugin-ai-core-backend-module-kubernetes`: contract, read-only tools, and module shell exist, but the Backstage-aware `KubernetesDiagnosticsDriver` implementation is not present.
   - Do not enable the responder in the app backend until this lands. Same gate covers alert-ai-tuner (deploy timeline), oncall-handover (deploy signals), and drift-detector (live topology) — build once.

2. **Approved write actions (post-v1)**
   - Future remediation/notification steps require: a write-capable Kubernetes contract (restart/scale/rollout — does not exist anywhere), `communication.message.post`, and `project.ticket.create` (exists, `effect: 'write'`). Any such step must be an artifact + explicit human approval via `WorkflowRunner.resume()`.

## Plugin-local items (no core blocker)

3. **Scheduler poll trigger** — webhook trigger exists; add the optional scheduler poll per the plan (Milestone: triggers), dispatching authenticated runs for unresolved incidents.
4. **Catalog-to-repository resolution refinement** — retain only commits/PRs inside the incident window (`vcs.pull_request.list` window filter; see the shared VCS filter item aggregated under `plugin-ai-core-backend-module-vcs`).
5. **Real-model evaluation suite** — opt-in `yarn test:eval:kubernetes-ai-responder` with scripted-fixture deterministic mode in CI and provider-neutral real-model mode (`AI_EVAL_MODEL_REF`), structural grading, budget caps.
6. **Playwright E2E (Milestone 3)** — `app-config.e2e.yaml` fixture backend plus Playwright scenarios (OOM completed run, insufficient-evidence run); component + accessibility tests already exist.
7. **Evidence budget tuning** — fixed observability query budget with graceful degradation when no observability driver is configured.
