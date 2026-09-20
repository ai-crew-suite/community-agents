# Kubernetes Module — Aggregated Roadmap Items

## 1. Complete the Backstage-aware diagnostics implementation (enablement gate)

- **Gap**: `KubernetesDiagnosticsDriver` contract, read-only `kubernetes.*` tools, and the module shell exist, but the Backstage-aware diagnostics implementation is not present.
- **Build**: implement the driver against the Backstage Kubernetes backend (catalog-to-workload resolution, pods, events, rollout conditions, log truncation/redaction, denied access, timeouts — fixture transcripts are specified in the responder plan).
- **Blocked consumers**: kubernetes-ai-responder (do not enable in the app backend until this lands), alert-ai-tuner (`kubernetes.workload.get_timeline` deploy correlation; currently a standing limitation capping confidence at `low`), oncall-ai-handover-assistant (deploy/scaling signals in briefs), scaffolder-ai-drift-detector (live topology).
- **Post-v1**: any write-capable Kubernetes contract (restart/scale/rollback) must be a separate, approval-gated design — no plugin should assume it.
