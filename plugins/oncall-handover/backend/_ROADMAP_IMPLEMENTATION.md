# On-Call Handover Assistant — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (v1 read-only brief delivered; writes deferred to v1.1 by design).

## Blocked on shared core/module work

1. **Deployment/scaling signals in the brief**
   - Blocked on `plugin-ai-core-backend-module-kubernetes` Backstage-aware diagnostics (`kubernetes.workload.get_timeline`, `list_events`, `get_snapshot`). Today a missing tool becomes a brief limitation, not a failure. When it lands, wire the deploy collector and drop the limitation.

2. **Brief dispatch / incident annotation (v1.1)**
   - Needs `communication.message.post` (Slack) and `incident.incident.annotate` (`effect: 'write'` — exists per techdocs-ai-postmortem's verification; confirm and allow-list). Must be artifact-gated and approval-required via `WorkflowRunner.resume()`; scheduled briefs use the service principal, on-demand runs use the propagated user identity.
   - Optional: `project.ticket.create/comment` (exists, `effect: 'write'`) to file the brief as a ticket — same approval-gated path.

## Plugin-local items (no core blocker)

3. **Scheduled-brief history list (frontend)** — needs a persisted brief history read path; if core adds `listArtifacts(filter)` (see tech-radar-ai-manager), consume it for `oncall-handover-brief` artifacts instead of a bespoke table.
4. **Scope-bounding polish** — reject unscoped whole-workspace runs; clamp windows; cap signals per source (plan §Security) — verify coverage in scheduler tests with fast-forwarded ticks (overlap, kill switch).
