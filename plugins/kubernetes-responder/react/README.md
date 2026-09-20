# Kubernetes AI Responder (frontend)

Frontend companion to `@ai-crew-suite/plugin-agent-kubernetes-responder-backend`.
It lets a permitted user start a **read-only** Kubernetes incident investigation,
follow the run live over the AI Core server-sent events stream, and inspect the
cited, redacted evidence bundle and the final triage report.

## Responsibilities (v1)

- Incident triage page plus a catalog-entity context action (deep link).
- Start a **manual read-only investigation** by catalog entity reference or by
  workload coordinates (`cluster` + `namespace` + `workload`).
- Start a run via `POST /agents/kubernetes-ai-responder/runs` and follow live
  progress; deep link to a run and replay its history via `GET /runs/:runId/events`.
- Render graph-node progress, redacted evidence summaries, the final report,
  its limitations, and artifact references.
- All evidence is labeled as **observed data**; likely causes are labeled
  **model inference**. Raw unbounded log content is never rendered.
- No remediation actions in v1.

## Wire-up

Register the new-frontend-system plugin from `/alpha` in the app
(`packages/app/src/App.tsx`), and optionally link a catalog entity to the page
with `/kubernetes-ai-responder?entityRef=<ref>`.
