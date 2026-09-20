# RFC / ADR AI Reviewer (Frontend)

Standalone Backstage page for the RFC/ADR AI reviewer. Start a parallel design
review of one `adr/` or `rfc/` document, watch the **Senior Architect** and
**Security Lead** channels debate live in two columns over SSE, and inspect the
deterministically merged design critique with its `block` / `comment` /
`approve` verdict and per-finding citations.

## Surfaces

- `ReviewPage` — standalone page mounted at `/rfc-adr-ai-reviewer`. Runs are
  deep-linked and replayed with `?run=<id>`.
- `StartReviewDialog` — repository URL, document path (validated against the
  backend's `adr/` or `rfc/` requirement), optional ref, optional pull request.
- `DebateView` — two-column live debate. Streamed text is demultiplexed by the
  run event's optional `token.node` tag; untagged streams collapse into a single
  transcript so no turns are lost.
- `CritiquePanel` / `FindingCard` — merged findings sorted by severity, each
  showing its originating channel and expanded citation evidence.
- `ApprovalBar` / `PublicationBanner` — the human approval gate and its outcome.

## Backend contract

The client talks to the shared AI Core backend (`ai-core` endpoint, overridable
with `ai.endpointPath`) and the `rfc-adr-ai-reviewer` agent:

- `POST agents/rfc-adr-ai-reviewer/runs` — start a review with a versioned
  `ReviewRequest` in `input.query`.
- `GET runs/<id>/events` — replay persisted events, optionally after a
  `Last-Event-ID` checkpoint.
- `POST runs/<id>/approvals` — submit an `ApprovalDecision`.

## Current limitations

The reviewer backend milestone is **read-only, manual-triggered, and
draft-only**: no `vcs.pull_request.comment` write tool is registered yet, so
normal runs finish at the `design-critique` artifact and the approval controls
stay hidden. The typed approval surface (`submitApproval`, `ApprovalBar`,
`PublicationBanner`) is implemented so the write milestone needs no UI rework,
and the backend's recorded limitations are rendered with the critique.
