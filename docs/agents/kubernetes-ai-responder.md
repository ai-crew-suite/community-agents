---
layout: default
title: Incident Triage Assistant
parent: Incident Response
plugin_name: plugin-ai-agent-backend-kubernetes-ai-responder
subcategory: Operations
---

# Incident Triage Assistant

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Incident Triage Assistant (Kubernetes AI Responder) is an AI Core backend agent that **investigates Kubernetes workload failures on-demand** — triggered by an Alertmanager webhook or manual operator action — and produces a cited incident triage report with likely root causes, an evidence timeline, and recommended next steps. When a pod is OOMKilled, an image fails to pull, a container enters a crash loop, or a rollout exceeds its progress deadline, the assistant gathers bounded Kubernetes diagnostics, classifies the failure signature deterministically, and synthesizes a model-authored report citing the collected evidence.

The investigation is **purely read-only and diagnostic**: the assistant gathers workload snapshots, pod container states, previous-container logs, workload events, and deployment timelines through the shared Kubernetes driver contract, but it never proposes — and can never execute — restarts, scaling, rollbacks, or any other Kubernetes mutation. The report always distinguishes observed data from model inference and cites every claim with a specific evidence ID from the gathered bundle.

## Key Features

- **Deterministic failure classification** via container termination reasons and rollout conditions — OOMKilled, ImagePullBackOff, CrashLoopBackOff, and ProgressDeadlineExceeded each drive distinct evidence-collection plans
- **Bounded log collection** for terminated and restarting containers, capped at `maxLogBytes` bytes per container and `maxLogContainers` containers per investigation
- **Model-authored cited report** with likely causes (each citing retained evidence IDs), recommended next steps, and a limitations list — with automatic fallback to deterministic failure-class causes when the model fails
- **Evidence normalization and redaction** that strips bearer tokens, credential assignments, AWS key IDs, and PEM private keys from every evidence item before it enters the model prompt
- **Session memory** for conversational follow-up questions about the same incident
- **Alertmanager webhook trigger** plus manual investigation via the frontend UI
- **Incident action button** on catalog entity pages that pre-fills the triage page with the entity reference

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-kubernetes-responder-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `IncidentTriageGraph` workflow runner (ID `kubernetes-incident-triage`), the `kubernetes-ai-responder` agent definition with a read-only allow-list of 6 Kubernetes tools, and an Alertmanager webhook trigger
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-kubernetes-responder`, `role: frontend-plugin`, `pluginId: kubernetes-ai-responder`) — provides a standalone incident triage page at `/kubernetes-ai-responder`, a typed SSE API client, a trigger dialog accepting entity-ref or explicit workload coordinates, a live run timeline, evidence and report panels, and a catalog entity action button

The graph runs through seven nodes: `trigger.validate → workload.resolve → failure.classify → evidence.collect → evidence.normalize → synthesize → report.finalize`. The artifact kind is `incident-triage-report`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required; `ai.agents.kubernetesAiResponder.model` references a registered model ID |
| Kubernetes diagnostics | `plugin-ai-core-backend-module-kubernetes` — `KubernetesDiagnosticsDriver` and `kubernetes.*` tools | Required for all investigation evidence; without a functional K8s driver, every run produces `insufficient_evidence` |
| Incident management (future) | `plugin-ai-core-backend-module-incident-management` — `incident.*` tools | Not yet integrated; webhook triggers carry incident context in the trigger payload itself |
| Observability (future) | `plugin-ai-core-backend-module-observability` — `observability.*` tools | Not yet integrated; evidence bundle is K8s-only in v1 |
| VCS (future) | `plugin-ai-core-backend-module-vcs` — `vcs.*` tools | Not yet integrated; recent change context is not gathered |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

#### Trigger Sources

The responder accepts incident triggers from two channels:

- **`alertmanager` webhook** — the `kubernetes-incident-webhook` trigger is registered with `source: alertmanager` and accepts normalized `KubernetesIncidentTrigger` payloads
- **Manual** — the frontend `TriggerIncidentDialog` sends a full `KubernetesIncidentTrigger` with `source: manual` and `occurredAt` defaulting to the current time

A valid trigger must include either a catalog `entityRef` or explicit workload coordinates (`cluster` + `namespace` + `workload`).

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-kubernetes-responder-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`, add alongside other `@ai-crew-suite` module loads:

```ts
import { kubernetesAiResponderModule } from '@ai-crew-suite/plugin-agent-kubernetes-responder-backend';

// Inside your backend builder:
backend.add(kubernetesAiResponderModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.kubernetesAiResponder.model` is missing. Add at minimum:

```yaml
ai:
  agents:
    kubernetesAiResponder:
      model: kubernetes-ai-responder
```

See [Configuration Reference](#configuration-reference) for the full schema and all defaults.

#### 4. Refresh Yarn PnP

```bash
yarn install
yarn typecheck --force
yarn lint --force
```

### Frontend Setup

#### 1. Add the frontend plugin dependency

In `packages/app/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-kubernetes-responder": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`, import the alpha entry point:

```ts
import kubernetesAiResponderExtensions from '@ai-crew-suite/plugin-agent-kubernetes-responder/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    kubernetesAiResponderExtensions,
  ],
});
```

This installs the standalone incident triage page at `/kubernetes-ai-responder`. The `IncidentActionButton` component can be mounted on catalog entity pages to provide a shortcut from a service page to the pre-filled triage form.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the Kubernetes AI responder plugin ID (`kubernetes-ai-responder`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    kubernetesAiResponder:
      # Required: installation-registered model ID for report synthesis
      model: kubernetes-ai-responder

      # --- optional, with defaults ---

      maxEvidenceItems: 20         # Max evidence items retained in the report timeline
      maxLogBytes: 16384            # Max bytes per container log excerpt (16 KB)
      lookbackMinutes: 30           # Minutes of context gathered before the trigger time
      maxToolInvocations: 12        # Hard cap on tool invocations per investigation run
```

### RBAC & Permissions

The responder uses the shared AI Core RBAC model:

- **Manual investigation** — any Backstage user with access to the `kubernetes-ai-responder` plugin can start an investigation via `POST agents/kubernetes-ai-responder/runs`
- **Webhook trigger** — Alertmanager webhooks carry the triggering alert's context in the payload itself; webhook authentication is managed at the AI Core HTTP ingress layer
- **No per-failure-class RBAC** is defined yet; all failure classes are available to any authenticated user

### Catalog Entity Annotations

The responder uses the following catalog annotations for workload resolution:

```yaml
metadata:
  annotations:
    # Resolves the catalog entity to a specific Kubernetes workload
    backstage.io/kubernetes-id: payment-gateway
```

When an `entityRef` is provided in the trigger, the responder looks up the entity through the `kubernetes.workload.resolve` tool. If the annotation is absent and no explicit workload coordinates are provided, the run terminates with `insufficient_evidence`.

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The responder agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'kubernetes-ai-responder',
  modelRef: config.modelRef,           // e.g. 'kubernetes-ai-responder'
  workflowRef: 'kubernetes-incident-triage',
  memory: 'session',                    // Enables follow-up questions about the incident
  systemPrompt: KUBERNETES_AI_RESPONDER_SYSTEM_PROMPT,
  toolIds: [                            // Read-only K8s diagnostic allow-list
    'kubernetes.workload.resolve',
    'kubernetes.workload.get_snapshot',
    'kubernetes.pod.get_snapshot',
    'kubernetes.pod.get_logs',
    'kubernetes.workload.list_events',
    'kubernetes.workload.get_timeline',
  ],
  triggers: [
    { id: 'kubernetes-incident-webhook', source: 'alertmanager' },
  ],
}
```

### Context Provisioning

An investigation is triggered by `POST agents/kubernetes-ai-responder/runs` with a `KubernetesIncidentTrigger` body:

```ts
type KubernetesIncidentTrigger = {
  version: 1;
  source: 'alertmanager' | 'datadog' | 'pagerduty' | 'prometheus' | 'manual' | 'scheduler';
  occurredAt: string;         // ISO 8601, normalized to UTC
  entityRef?: string;          // Catalog entity reference — alternative to explicit coords
  cluster?: string;
  namespace?: string;
  workload?: string;
  pod?: string;
  alertId?: string;
  severity?: string;
  summary: string;             // Human-readable incident description
  labels?: Record<string, string>;
};
```

At minimum, either `entityRef` or explicit workload coordinates (`cluster` + `namespace` + `workload`) must be provided. The `summary` field is used as the incident context in the model prompt.

### Graph Nodes

The graph runs a seven-node pipeline. Evidence collection in the `evidence.collect` node is gated by the failure class detected in `failure.classify`:

| Node | Source | Behaviour |
|---|---|---|
| **trigger.validate** | `normalizeAlert.ts` | Parses the JSON payload, validates version (`version: 1`), normalizes `occurredAt` to UTC, and ensures either an `entityRef` or workload coordinates are present |
| **workload.resolve** | `IncidentTriageGraph.ts` | Resolves the workload target: if `entityRef` is provided, calls `kubernetes.workload.resolve`; otherwise uses explicit coordinates. Fetches the workload snapshot via `kubernetes.workload.get_snapshot` and pod snapshots via `kubernetes.pod.get_snapshot` for every pod |
| **failure.classify** | `routing.ts` | Classifies the workload snapshot into one of 5 failure classes deterministically: checks container termination reasons (`OOMKilled`, image-pull reasons, crash-loop reasons), rollout conditions (`ProgressDeadlineExceeded`), and container restart counts (>=5 triggers crash-loop). Falls back to `unknown` when no pattern matches |
| **evidence.collect** | `IncidentTriageGraph.ts` | Invokes the failure-class-specific evidence plan (see table below), gathering previous-container logs, workload events, and/or timeline data within the incident time window |
| **evidence.normalize** | `evidence.ts` | Redacts sensitive text, deduplicates by ID (first occurrence wins), sorts by `observedAt` timestamp, and caps to `maxEvidenceItems` |
| **synthesize** | `report.ts` | Builds a prompt from the incident summary + failure class + normalized evidence bundle, invokes the model, extracts JSON from the response, validates every likely cause against the evidence ID set, and falls back to deterministic failure-class causes if validation fails |
| **report.finalize** | `report.ts` | Assembles the final `IncidentTriageReport` artifact with status (`investigated`, `insufficient_evidence`, or `failed`), failure class, trigger payload, likely causes with cited evidence, timeline, next steps, and limitations |

#### Per-Failure Evidence Plans

| Failure Class | Detection | Logs | Events | Timeline |
|---|---|---|---|---|
| **oom-killed** | Container termination reason `OOMKilled` | ✅ Previous container logs | ✅ Workload events | — |
| **image-pull** | `ImagePullBackOff`, `ErrImagePull`, or `InvalidImageName` | — | ✅ Workload events | ✅ Deployment timeline |
| **crash-loop** | `CrashLoopBackOff` or restart count >= 5 | ✅ Previous container logs | ✅ Workload events | — |
| **rollout-exceeded** | Condition `ProgressDeadlineExceeded` | — | ✅ Workload events | ✅ Deployment timeline |
| **unknown** | No recognized failure pattern | — | ✅ Workload events | — |

### Evidence Collection & Budget

The investigation is bounded by configurable limits:

- **maxToolInvocations** (default 12) — hard cap on total tool calls per run. The graph yields an `insufficient_evidence` report if the budget is exhausted before classification completes
- **maxLogBytes** (default 16384) — each previous-container log excerpt is truncated to this byte limit before normalization
- **maxLogContainers** (default 3) — at most this many containers per pod have their previous logs collected
- **lookbackMinutes** (default 30) — the incident time window extends from `occurredAt - lookbackMinutes` to `occurredAt + 15 minutes`
- **maxEvidenceItems** (default 20) — the normalized evidence bundle is capped; oldest items by `observedAt` are dropped when the cap is exceeded

### Citation Enforcement

The model output is parsed and validated before it becomes part of the report:

1. **JSON extraction** — tolerates fenced code blocks (` ```json ... ``` `) and surrounding prose; extracts only the outermost JSON object
2. **Citation validation** — every `likelyCause` must cite at least one retained evidence ID; uncited causes are dropped
3. **Confidence clamping** — model-supplied `confidence` values are clamped to `0..1` range; missing values default to `0.5`
4. **Fallback** — if no valid causes survive after validation, or if the model fails entirely, `deterministicCausesFor(failureClass)` is used instead, with each cause citing all retained evidence items

### Prompts & Tools Management

The system prompt for the model enforces a read-only, evidence-cited investigation posture:

```
Investigate Kubernetes incidents using only the supplied evidence bundle. State
uncertainty explicitly, prefer "insufficient evidence" over speculation, cite
evidence IDs for every claim, and never propose unapproved mutations.
```

The full synthesis prompt includes:
- The agent's system prompt
- The incident summary from the trigger payload
- The entity reference, when available
- The deterministic failure class
- The complete normalized evidence bundle with stable IDs
- Schema instructions requiring JSON output with `likelyCauses`, `recommendedNextSteps`, and `limitations` fields
- Explicit rules against proposing restarts, scaling, rollbacks, deletes, or any other mutation

#### Sensitive Text Redaction

All evidence summaries and model output pass through `redactSensitiveText()` before entering the model prompt or appearing in any artifact, SSE event, log, or test snapshot. The redaction engine strips:
- Bearer tokens
- `password|secret|token|api_key|access_key|authorization|credential=...` patterns
- AWS access key IDs (`AKIA`/`ASIA` prefixes)
- PEM private key blocks

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend provides two entry points:

1. **Standalone incident triage page** at `/kubernetes-ai-responder` — displays a `TriggerIncidentDialog` form (entity-ref or explicit workload coordinates), a live `RunTimeline` showing graph-node transitions and tool activity, an `EvidencePanel` with the gathered evidence bundle, and a `ReportPanel` with cited likely causes, next steps, and limitations
2. **Incident action button** — the `IncidentActionButton` component can be added to catalog entity pages, providing a one-click shortcut to the triage page with the entity reference pre-filled

Both surfaces deep-link to current runs via `?run=<id>` and pre-fill the trigger dialog via `?entityRef=<ref>`.

### Frontend Components

| Component | Role |
|---|---|
| `IncidentTriagePage` | Standalone page orchestrating the full investigation lifecycle — trigger, live progress, evidence, and report |
| `TriggerIncidentDialog` | Form accepting either a catalog `entityRef` or explicit workload coordinates (`cluster` + `namespace` + `workload`), with optional pod, severity, and summary fields |
| `RunTimeline` | Live graph-node transitions and bounded tool-call activity, streamed over SSE and rendered in real time |
| `EvidencePanel` | Labeled observed data showing bounded, redacted evidence summaries per source/kind, sorted by observation time |
| `ReportPanel` | Likely causes labeled as model inference, each citing evidence IDs; recommended next steps; and limitations |
| `RunStatusBanner` | Live `role="status"` / `aria-live` banner updating as the run transitions through phases |
| `IncidentActionButton` | Catalog entity context action linking to the triage page with the entity reference pre-filled |

### Human-in-the-Loop Actions

#### Starting a manual investigation

1. Navigate to `/kubernetes-ai-responder`
2. Click **Trigger a new investigation**
3. Fill in one of:
   - **Entity reference** — e.g. `component:default/payment-gateway` (requires `backstage.io/kubernetes-id` annotation)
   - **Workload coordinates** — `cluster`, `namespace`, and `workload` name
4. Optionally provide a `pod`, `severity`, and human-readable `summary`
5. Click **Start investigation**

The page streams live SSE events: graph nodes enter/exit, per-failure-class tool calls complete, and the cited report and evidence panels render as soon as the `incident-triage-report` artifact arrives.

#### Reading the triage report

The `ReportPanel` renders:
- **Failure class** — the deterministic signature that routed the investigation (e.g., `oom-killed`)
- **Likely causes** — model-authored analysis, each labeled **model inference** and citing specific evidence IDs with confidence scores
- **Recommended next steps** — actionable guidance (no mutations proposed)
- **Limitations** — tool failures, budget caps, missing annotations, model fallback explanations

The `EvidencePanel` renders the retained evidence timeline grouped by source (kubernetes). Each evidence item shows its kind, timestamp, bounded summary, and any stable reference (cluster/namespace/workload coordinates or object coordinates).

#### Replaying a past run

Append `?run=<id>` to the triage page URL. The run's persisted events replay in order, restoring the complete timeline, evidence, and report.

#### Webhook-Triggered Investigations

Alertmanager webhooks targeting the AI Core route (`POST agents/kubernetes-ai-responder/runs`) automatically create persisted, replayable investigation runs. The webhook payload is normalized into a `KubernetesIncidentTrigger` with `source: 'alertmanager'`, and the investigation proceeds identically to a manual run. Failed webhook-triggered runs can be replayed and inspected through the frontend.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"Kubernetes AI responder requires ai.agents.kubernetesAiResponder configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config:

```yaml
ai:
  agents:
    kubernetesAiResponder:
      model: kubernetes-ai-responder
```

**Run terminates with `insufficient_evidence` on every investigation**

No Kubernetes workload could be resolved. Check that:
- Either a valid `entityRef` or explicit workload coordinates (`cluster` + `namespace` + `workload`) are provided
- The entity has `backstage.io/kubernetes-id` annotation set if using `entityRef`
- The `plugin-ai-core-backend-module-kubernetes` module is installed and configured
- The Kubernetes driver has cluster access and can resolve the workload

**Report says `unknown` failure class for a recognizable failure pattern**

The deterministic classifier checks only container termination reasons, rollout conditions, and restart counts. If a pod is failing for a reason not covered by these patterns (e.g., a readiness probe timeout with no terminated containers), the class will be `unknown`. This is a handled state — evidence is still collected (workload events), and the model synthesizes a report from whatever diagnostics were gathered.

**No log excerpts in the evidence bundle for a crashed container**

Previous-container logs are only collected when the evidence plan for the failure class enables them (`oom-killed` and `crash-loop`). For `image-pull`, `rollout-exceeded`, and `unknown` classes, logs are skipped because the failure is either pre-startup or infrastructure-level. Additionally, the `maxLogContainers` cap (default 3) limits how many containers per pod have their logs pulled.

**LLM rate limits or context window overruns**

- Reduce `maxEvidenceItems` to present fewer evidence items to the model
- Reduce `maxLogBytes` to cap individual log excerpts smaller
- Reduce `maxToolInvocations` to cap the diagnostic budget per investigation
- The system prompt is compact, evidence summaries are capped at 1024 characters, and logs are bounded at `maxLogBytes` — the total prompt size is bounded

### Frontend Issues

**Page loads but "Start investigation" does nothing**

Ensure `playwright/.auth/login.json` exists (created by the CI mock auth step or manually as `{}`). The API client requires Backstage identity credentials.

**Trigger dialog requires workload coordinates even with entityRef**

If the entity does not have `backstage.io/kubernetes-id` annotation, the backend cannot resolve it to a workload, and the investigation will fail. Either add the annotation to the entity's `catalog-info.yaml` or provide explicit workload coordinates.

**Evidence panel shows no data**

If the K8s driver returns empty results for every tool call, the evidence bundle will be empty and the report status will be `insufficient_evidence`. Check that the Kubernetes cluster is reachable and the driver has appropriate RBAC permissions.

---

## Roadmap

### Multi-Source Evidence Integration

The current evidence bundle is Kubernetes-only. Future work will integrate additional data sources through existing shared module contracts:

- **VCS change context** — correlate recent pull requests and commits against the incident window via `vcs.pull_request.list`, helping identify whether a recent deploy or configuration change triggered the failure
- **Observability evidence** — pull related logs, traces, and dashboard links via `observability.logs.search` and `observability.dashboard.list` for correlated diagnostic context
- **Incident management context** — correlate active incidents and alert history via `incident.incident.list` to establish whether the failure is part of a broader incident
- **Knowledge retrieval** — entity-scoped RAG documentation context via `knowledge.retrieve` to surface runbooks and operational playbooks in the report

### Remediation Actions

Currently restricted to read-only diagnostics. Future releases will add human-gated remediation steps:

- **Restart, scale, and rollout undo** — gated behind explicit human approval and bound to a single workload per investigation
- **Apply configuration patches** — propose and review resource limit/request adjustments based on OOMKilled evidence
- **Exec and shell access** — for advanced debugging, gated behind a secondary approval policy and audit logging
- All remediation actions remain human-triggered and explicit, never autonomous

### Automated Notification & Escalation

- Post investigation results to incident channels (Slack, PagerDuty, project management tools) when a triage report identifies a likely cause above a configurable confidence threshold
- Auto-escalate investigations with `insufficient_evidence` to an on-call responder with the collected evidence bundle
- Notification content remains bounded, redacted, and never includes raw log content or secrets

### Playwright End-to-End Test Suite

- `app-config.e2e.yaml` fixture backend with controlled K8s fixture data
- Playwright scenarios covering full happy-path investigation, degradation paths (`insufficient_evidence`, `unknown` failure class), webhook-triggered runs, and replay recovery
- Screenshot-based review of the triage report, evidence panel, and timeline rendering

### Production Dashboards & Model Evaluation

- Usage dashboards tracking investigation volume, failure-class distribution, tool invocation counts, and model latency/token cost
- An opt-in real-model evaluation harness that compares model-authored causes against a curated corpus of known-failure-class fixture data with verified root causes
- Evidence-completeness monitoring: track which failure classes most often produce `insufficient_evidence`, indicating missing driver coverage
