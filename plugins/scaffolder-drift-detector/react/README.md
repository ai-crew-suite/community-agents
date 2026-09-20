# Scaffolder AI Drift Detector (Frontend)

Standalone Backstage page for starting and replaying the implemented
Kubernetes-backed Scaffolder drift detector.

## Current surface

- `/scaffolder-ai-drift-detector` standalone page with `?run=<id>` SSE replay.
- On-demand entity check using temporary bounded blueprint fields (expected
  replicas/image) until the shared Scaffolder blueprint reader exists.
- Cited expected-versus-actual drift item display.
- First-class `drifted`, `in_sync`, `partial`, and `insufficient_evidence`
  results plus retained limitations/evidence.

## Backend contract

`DriftDetectorClient` calls the AI Core endpoint (`ai.endpointPath`, default
`ai-core`) with `eventsource-parser`:

- `POST agents/scaffolder-ai-drift-detector/runs`
- `GET runs/<id>/events` with `Last-Event-ID` replay
- typed future `POST runs/<id>/approvals`

## Current limitation

The backend emits only `drift-report`. Normalized cloud tools, the shared
Scaffolder blueprint reader, VCS PR creation, remediation patches, approvals,
and fleet report-listing do not exist yet. The UI therefore does not invent a
fleet API, patch preview, approval control, or pull-request link.
