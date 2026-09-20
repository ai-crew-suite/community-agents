# Observability Module — Aggregated Roadmap Items

No blocking items reported. The Datadog driver covers the `observability.*` tools consumed by catalog-ai-insights, kubernetes-ai-responder, alert-ai-tuner (`observability.metrics.query`), and oncall-handover.

## Watch items (not blockers)

- Consumers require graceful degradation when no observability driver is configured (limitation, never a run failure) — preserve that contract.
- kubernetes-ai-responder specifies a fixed evidence query budget; keep tool timeouts and result caps aligned with that expectation.
