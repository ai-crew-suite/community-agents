# @ai-crew-suite/plugin-agent-kubernetes-responder-backend

Backend module for `@ai-crew-suite/plugin-kernel-backend` that turns an authenticated incident trigger into a bounded, auditable, **read-only**
Kubernetes investigation. It produces a cited likely-cause report and
recommended next steps. It never mutates Kubernetes, repositories, or
third-party systems.

## How it works

The module registers three things with AI Core at boot:

1. A **workflow runner** (`kubernetes-incident-triage`) through
   `workflowRunnerExtensionPoint`.
2. An **agent definition** (`kubernetes-ai-responder`) through
   `agentExtensionPoint`, referencing the runner via `workflowRef` and an
   allow-list of the six read-only `kubernetes.*` diagnostics tools.
3. A **trigger binding** (`kubernetes-incident-webhook`) through
   `triggerExtensionPoint` so generic trigger endpoints can start runs.

The `IncidentTriageGraph` executes deterministic nodes:

1. **trigger.validate** — validates the versioned `KubernetesIncidentTrigger`
   payload (`triggers/normalizeAlert.ts`).
2. **workload.resolve** — resolves the catalog entity via
   `kubernetes.workload.resolve`, or uses explicit workload coordinates.
3. **workload.snapshot** — collects workload/pod diagnostics.
4. **evidence.route** — classifies the failure signature (`oom-killed`,
   `image-pull`, `crash-loop`, `rollout-exceeded`, `unknown`) in
   `workflow/routing.ts`.
5. **evidence.collect** — gathers a bounded, failure-class-specific evidence
   set (previous container logs, events, rollout timeline) through
   `services/InvestigationToolRunner`, which caps invocations and converts
   tool failures into report limitations.
6. **evidence.normalize** — redacts credential-like strings, deduplicates,
   sorts by observation time, and caps the bundle (`workflow/evidence.ts`).
7. **report.synthesize** — asks the installation-configured model for a strict
   JSON synthesis; every likely cause must cite retained evidence IDs. Invalid
   or uncited output degrades to deterministic causes (`workflow/report.ts`).
8. **report.finalize** — emits the `incident-triage-report` artifact and the
   terminal run event.

Run lifecycle, tool allow-list enforcement, persistence, SSE replay, and
auditing remain owned by AI Core.

## Configuration

```yaml
ai:
  agents:
    kubernetesAiResponder:
      model: incident-triage # installation-registered model ID, required
      maxEvidenceItems: 20   # optional, default 20
      maxLogBytes: 16384     # optional, default 16384
      lookbackMinutes: 30    # optional, default 30
      maxToolInvocations: 12 # optional, default 12
```

`model` is a registry ID supplied by an installation model module (Bedrock,
OpenAI, OpenRouter, ...); the plugin never references provider names,
endpoints, or credentials.

## Triggering a run

POST a run to the generic AI Core endpoint `/agents/kubernetes-ai-responder/runs`
with the query set to a JSON `KubernetesIncidentTrigger` payload, for example:

```json
{
  "version": 1,
  "source": "alertmanager",
  "occurredAt": "2026-08-20T11:55:00.000Z",
  "entityRef": "component:default/payment-gateway",
  "alertId": "alert-42",
  "severity": "critical",
  "summary": "Pod payment-gateway-1 restarting"
}
```

A trigger must supply either `entityRef` or `cluster` + `namespace` +
`workload` coordinates.

## Prerequisites

The read-only `kubernetes.*` tools are provided by
`@ai-crew-suite/plugin-kernel-backend-module-kubernetes`, which must be
loaded in the backend with a working Backstage Kubernetes integration before
responder runs can collect real diagnostics.

## Out of scope for v1

- Any Kubernetes write (restart, scale, rollout undo, delete, apply, exec).
- Access to Secret values or ConfigMap data.
- Automatic notification, ticket creation, or remediation.
