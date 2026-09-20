# Incident Management Module — Aggregated Roadmap Items

No blocking items reported. `incident.alert.history`, `incident.incident.list`, `incident.incident.get`, `incident.oncall.get` (read) and `incident.incident.annotate` (write) cover the alert-ai-tuner, catalog-ai-insights, oncall-handover, kubernetes-ai-responder, and techdocs-ai-postmortem plans.

## Watch items (not blockers)

- Window-bound `incident.alert.history` queries (consumers clamp windows themselves today).
- oncall-handover v1.1 plans to allow-list `incident.incident.annotate` behind the approval gate — no driver change needed, but confirm the write op's audit behavior end-to-end once consumed.
