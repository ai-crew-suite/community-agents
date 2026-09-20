# Scaffolder AI Drift Detector (Backend)

AI Core backend module for deterministic drift detection between a bounded
golden-path component expectation and its live Kubernetes workload state.

- Agent ID: `scaffolder-ai-drift-detector`
- Workflow ID: `scaffolder-drift`
- Artifact kind: `drift-report`

## Current read-only milestone

The workflow validates one `entityRef`, requires a bounded `blueprint` payload
until the shared Scaffolder blueprint reader exists, resolves the component to a
Kubernetes workload, reads its live snapshot, and deterministically compares
replicas, image, CPU limit, and memory limit. Every drift item cites `bp-1` and
`live-1`; no language-model output decides drift.

A missing blueprint, workload, or snapshot is emitted as an explained
`insufficient_evidence` report rather than guessed. Read-tool failures produce a
`partial` report. The module never mutates Kubernetes or repositories.

## Deferred shared contracts

The full remediation plan is intentionally not fabricated:

- `cloud.resource.*` cannot be consumed until cloud provider tools are normalized
  from legacy LangChain `name`/`execute` shapes into AI Core `ToolDefinition`s.
- The shared Scaffolder blueprint/provenance reader does not exist yet; callers
  must temporarily provide bounded blueprint fields in the run payload.
- `vcs.pull_request.create` does not exist, so no remediation patch, approval
  event, `resume()` implementation, checkpoint, or PR write path is advertised.
- Fleet sweep/persistent drift-state deduplication requires a shared artifact or
  checkpoint lookup API that can query a component's prior reports.

## Configuration

```yaml
ai:
  agents:
    driftDetector:
      model: drift-detector
```

See `config.d.ts` for optional limits and future sweep/remediation configuration.
