# Alert Fatigue Tuner (Frontend)

Standalone Backstage UI for evaluating alert fatigue and reviewing the backend's
cited, deterministic Infrastructure-as-Code tuning proposals.

## Surface

- `/alert-ai-tuner` standalone page, with `?run=<id>` replay for persisted SSE
  events.
- On-demand evaluation form for alert/service scope, repository, optional IaC
  path, and analysis window.
- Live graph and tool progress from the AI Core SSE stream.
- Noise evidence panel showing only deterministic backend statistics and their
  retained `fire-N`/`inc-N`/`iac-N`/`metric-N` citations.
- Exact anchored unified-diff preview, including its patch hash.
- First-class `not_noisy`, `insufficient_evidence`, `anchor_not_found`, and
  `partial` proposal outcomes; limitations and confidence are always visible.

## Backend contract

`AlertTunerClient` talks to the shared AI Core endpoint (`ai.endpointPath`,
default `ai-core`) with `eventsource-parser`:

- `POST agents/alert-ai-tuner/runs` starts an evaluation using a versioned
  `AlertTuningRequest` in `input.query`.
- `GET runs/<id>/events` replays persisted events and supports `Last-Event-ID`.
- `POST runs/<id>/approvals` is retained as a typed future API surface.

## Current backend limitation

The implemented backend is **proposal-only**. It emits
`alert-tuning-proposal`, but the shared `vcs.pull_request.create` write tool is
not registered, so no `approval_request` or publication artifact is produced.
The typed `ApprovalBar` and `PublicationBanner` are deliberately rendered only
when their real SSE events arrive; the UI never invents a write gate or a pull
request link.
