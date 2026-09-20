# Scaffolder AI Guardrail Agent (Frontend)

Standalone Backstage review UI for advisory, deterministic guardrail assessments
of one Scaffolder template request.

## Surface

- `/scaffolder-ai-guardrail-agent` standalone review page with `?run=<id>` SSE
  replay.
- Template reference, environment, and JSON parameter evaluation dialog.
- Driver-originated violations with severity and evidence citations.
- Compliance-driver budget estimate/threshold display.
- Config-derived mutation alternatives shown as explicit parameter diffs.
- Negotiation accept/reject UI only when AI Core emits an approval request;
  blocked assessments render no accept path.
- Resolution banner with returned approved parameters and persistent advisory
  enforcement warning.

## Contract

The typed client talks to `ai-core` through Backstage discovery:

- `POST agents/scaffolder-ai-guardrail-agent/runs`
- `GET runs/<id>/events` with `Last-Event-ID`
- `POST runs/<id>/approvals`

The backend has no assessment-list endpoint and no Scaffolder interception
extension. This UI therefore does not invent a list API and cannot guarantee a
direct Scaffolder API request was evaluated; it renders the backend's explicit
`advisory-only: not enforced server-side` limitation.
