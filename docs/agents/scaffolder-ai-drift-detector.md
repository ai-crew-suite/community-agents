---
layout: default
title: Scaffolder AI Drift Detector
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-drift-detector
subcategory: Compliance
---

# Scaffolder AI Drift Detector

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI Drift Detector compares a component's **live Kubernetes state** against a supplied **golden-path blueprint** and produces a deterministic `DriftReport` identifying every structural divergence. An operator provides a catalog entity reference and bounded blueprint expectations (replicas, image, CPU/memory limits), and the graph resolves the workload through the Kubernetes driver, fetches a normalized snapshot, and computes field-by-field diffs between the expected and actual values.

The comparison is **entirely deterministic**: `computeDrift()` in `delta.ts` is a pure function that compares four fields (`spec.replicas`, `container.image`, `resources.limits.cpu`, `resources.limits.memory`) and emits a `DriftItem` for every mismatch with evidence citations (`bp-1` for the blueprint side, `live-1` for the Kubernetes snapshot side). No LLM is invoked. The model reference in the agent definition is reserved for future narrative copy generation.

## Key Features

- **Deterministic field-by-field comparison** — four structural fields are compared between the golden-path blueprint and live Kubernetes workload snapshot, with per-field severity labels (`major` for replicas/image/memory, `minor` for CPU limits)
- **Evidence-keyed drift items** — every divergence carries paired evidence from both the blueprint expectation (`bp-1`) and the live observation (`live-1`)
- **Four report statuses** — `in_sync` (no drift), `drifted` (at least one divergence), `partial` (drift detected but with tool limitations), `insufficient_evidence` (blueprint missing or workload unresolvable)
- **Blueprint validation** — the `DriftCheckRequest` parser validates all blueprint fields (replicas must be a finite number, image must be a non-empty string, limits must be an object with optional cpu/memory strings)
- **Explicit limitation tracking** — missing shared contracts (cloud resource tools, template provenance reader, VCS write tool) are recorded as persistent limitations rather than silently ignored

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-scaffolder-drift-detector-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `DriftGraph` workflow runner (ID `scaffolder-drift`), the `scaffolder-ai-drift-detector` agent definition with a read-only allow-list of 3 tools, and manual/scheduler triggers
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-scaffolder-drift-detector`, `role: frontend-plugin`, `pluginId: scaffolder-ai-drift-detector`) — provides a standalone page at `/scaffolder-ai-drift-detector` with a drift-check dialog (entity ref + blueprint form), a drift item list with expected-vs-actual comparisons, and replay via `?run=<id>`

The graph runs three nodes: `livestate.ingest` resolves the workload and fetches a snapshot, then `delta.compute` performs the deterministic comparison. The artifact kind is `drift-report`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; `ai.agents.driftDetector.model` references a registered model ID (not currently invoked — reserved for future narrative generation) |
| Kubernetes diagnostics | `plugin-ai-core-backend-module-kubernetes` — `kubernetes.workload.resolve`, `kubernetes.workload.get_snapshot` | Required for live-state ingestion; missing driver produces `insufficient_evidence` |
| VCS repository read | `plugin-ai-core-backend-module-vcs` — `vcs.repository.read_file` | Listed in tool allow-list but not yet invoked; reserved for future IaC file comparison |
| Cloud providers (future) | `plugin-ai-core-backend-module-cloud-providers-*` — `cloud.resource.*` | Not available; cloud topology reconciliation is deferred until shared tool contracts are normalized |
| Scaffolder template reader (future) | Not yet registered as a shared contract | Not available; the blueprint must be caller-supplied until a shared Scaffolder blueprint/provenance reader is registered |
| Runtime store | `plugin-ai-core-backend-module-runtime-store` | Required for run/artifact persistence |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-drift-detector-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`:

```ts
import { driftDetectorModule } from '@ai-crew-suite/plugin-agent-scaffolder-drift-detector-backend';

// Inside your backend builder:
backend.add(driftDetectorModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.driftDetector.model` is missing:

```yaml
ai:
  agents:
    driftDetector:
      model: drift-detector
```

See [Configuration Reference](#configuration-reference) for the full schema.

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
  "@ai-crew-suite/plugin-agent-scaffolder-drift-detector": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import driftDetectorExtensions from '@ai-crew-suite/plugin-agent-scaffolder-drift-detector/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    driftDetectorExtensions,
  ],
});
```

The page is available at `/scaffolder-ai-drift-detector`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the drift detector plugin ID (`scaffolder-ai-drift-detector`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

All properties except `model` are optional and fall back to documented defaults:

```yaml
ai:
  agents:
    driftDetector:
      # Required: installation-registered model ID (reserved for future narrative generation)
      model: drift-detector

      # --- optional, with defaults ---

      maxInfraFiles: 8              # Max IaC paths accepted per request
      maxDriftItems: 40             # Max drift items retained in the report
      maxToolInvocations: 18        # Hard cap on tool invocations per run
      infraPaths:                   # Default IaC paths searched when none supplied
        - main.tf
        - deployment.yaml
        - k8s/**

      # Fleet sweep (not yet active — no scheduler deps in v1)
      sweep:
        enabled: false
        cron: '0 */24 * * *'        # Default: every 24 hours
        maxSweepComponents: 50
        entityRefs: []

      # Remediation switch (ineffective — VCS write tool not registered)
      remediate:
        enabled: false
```

### RBAC & Permissions

The drift detector uses the shared AI Core RBAC model:

- **Manual drift check** — any Backstage user with access to the `scaffolder-ai-drift-detector` plugin can submit a check via `POST agents/scaffolder-ai-drift-detector/runs`
- **No fleet scheduler** is registered yet (module has no scheduler deps); the `sweep` config block and `drift-fleet-sweep` trigger are reserved for future use

### Blueprint Specification

The `blueprint` field in `DriftCheckRequest` is **required** — if absent, the run terminates with `insufficient_evidence`. The blueprint spec accepts four fields:

```ts
type BlueprintSpec = {
  replicas?: number;               // Must be a finite number; compared to live workload replicas
  image?: string;                   // Non-empty string; compared to live container image
  limits?: {
    cpu?: string;                   // e.g. '500m'; compared to live CPU limit
    memory?: string;                // e.g. '512Mi'; compared to live memory limit
  };
};
```

Each field is optional — if a field is omitted from the blueprint, it is skipped in the comparison and no drift item is emitted for that field.

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The drift detector agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'scaffolder-ai-drift-detector',
  modelRef: config.modelRef,           // e.g. 'drift-detector' (reserved)
  workflowRef: 'scaffolder-drift',
  memory: 'none',                       // Each run is a fresh comparison
  systemPrompt: DRIFT_DETECTOR_SYSTEM_PROMPT,
  toolIds: [
    'kubernetes.workload.resolve',
    'kubernetes.workload.get_snapshot',
    'vcs.repository.read_file',         // Reserved for future IaC comparison
  ],
  triggers: [
    { id: 'drift-check-on-demand', source: 'manual' },
    { id: 'drift-fleet-sweep', source: 'scheduler' },  // Reserved
  ],
}
```

### Context Provisioning

A drift check is triggered by `POST agents/scaffolder-ai-drift-detector/runs`:

```ts
type DriftCheckRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  entityRef: string;            // Catalog entity reference, e.g. 'component:default/payment-gateway'
  repoUrl?: string;             // Reserved for future IaC file reads
  infraPaths?: string[];        // Reserved for future IaC file reads; validated for path safety
  remediate?: boolean;          // Reserved; currently records a limitation
  blueprint?: BlueprintSpec;    // Required — run terminates without it
};
```

The `entityRef` is required. The `blueprint` is **required** — without it the run terminates immediately with `insufficient_evidence` and a limitation explaining that golden-path blueprint provenance is unavailable until a shared template reader is registered.

### Graph Nodes

The graph runs a three-node pipeline:

| Node | Source | Behaviour |
|---|---|---|
| **livestate.ingest** | `DriftGraph.ts` | Resolves the Kubernetes workload via `kubernetes.workload.resolve`, fetches a snapshot via `kubernetes.workload.get_snapshot`. Produces `live-1` evidence from the snapshot summary. Both tool failures are terminal and produce `insufficient_evidence` |
| **delta.compute** | `delta.ts` | Runs `computeDrift()` — a pure function comparing four fields from the blueprint and live snapshot. Comparison is strict equality: `expected !== actual` triggers a drift item. Fields where either side is `undefined` are skipped |
| **report.finalize** | `DriftGraph.ts` | Assembles the `DriftReport` artifact with status (`in_sync`, `drifted`, `partial`), drift items capped at `maxDriftItems`, limitations, and evidence |

The graph records two persistent limitations on every run:
1. Cloud topology reconciliation is unavailable until `cloud.resource.*` tools are normalized
2. Remediation PR creation is unavailable until `vcs.pull_request.create` is registered

If `remediate` is true in the request or `remediate.enabled` in config, a third limitation is added: "Remediation was requested but this run is detect-only."

### The Comparison Engine

`computeDrift()` in `delta.ts` compares four fields with fixed severities:

| Field | Blueprint source | Live source | Severity |
|---|---|---|---|
| `spec.replicas` | `blueprint.replicas` | `snapshot.replicas?.desired` | `major` |
| `container.image` | `blueprint.image` | always `undefined` in current `normalizeLiveSnapshot()` | `major` |
| `resources.limits.cpu` | `blueprint.limits?.cpu` | always `undefined` in current `normalizeLiveSnapshot()` | `minor` |
| `resources.limits.memory` | `blueprint.limits?.memory` | always `undefined` in current `normalizeLiveSnapshot()` | `major` |

**Current limitation**: `normalizeLiveSnapshot()` hardcodes `image: undefined` and `limits: undefined`. Only `spec.replicas` comparisons can actually produce drift items. Image and resource limit comparisons are structural placeholders — the comparison logic is implemented but the live data is not yet extracted from the Kubernetes workload snapshot. The `KubernetesWorkloadSnapshot` type defines the fields but the extraction in `normalizeLiveSnapshot()` does not populate them.

### The Drift Report

```ts
type DriftReport = {
  entityRef: string;
  status: 'in_sync' | 'drifted' | 'partial' | 'insufficient_evidence';
  items: DriftItem[];           // Each with paired bp-1/live-1 evidence
  limitations: string[];
  evidence: EvidenceRef[];
};

type DriftItem = {
  id: string;                   // drift-1, drift-2, etc.
  field: 'spec.replicas' | 'container.image' | 'resources.limits.cpu' | 'resources.limits.memory';
  expected: { value: string | number | undefined; evidence: string[] };
  actual: { value: string | number | undefined; evidence: string[] };
  severity: 'critical' | 'major' | 'minor' | 'info';
};
```

### Prompts & Tools Management

The system prompt is registered but **not currently invoked**:

```
Compare only supplied golden-path and live snapshot evidence.
Every narrative claim must cite bp-N or live-N evidence.
Never invent resources, costs, template values, file paths, or a remediation patch.
This workflow is read-only and advisory.
```

The `modelRef` and `systemPrompt` are reserved for future AI-powered narrative generation that will produce human-readable summary text from the deterministic drift items.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/scaffolder-ai-drift-detector` and provides a single page with:

1. **Run drift check** button — opens the `RunDriftCheckDialog` form
2. **DriftItemList** — renders each drift item with its field name, expected vs actual value, severity badge, and paired evidence citations
3. **Replay** — runs are deep-linked via `?run=<id>`

The dialog requires an entity reference and bounded blueprint fields. Since the shared Scaffolder template reader is not yet available, the blueprint must be supplied manually.

### Human-in-the-Loop Actions

#### Running a drift check

1. Navigate to `/scaffolder-ai-drift-detector`
2. Click **Run drift check**
3. Fill in:
   - **Entity reference** — required, e.g. `component:default/payment-gateway`
   - **Replicas** — optional, the golden-path expected replica count
   - **Image** — optional, the expected container image
   - **CPU limit** — optional, e.g. `500m`
   - **Memory limit** — optional, e.g. `512Mi`
4. Click **Run check**

The page streams live SSE events: the workload is resolved, the snapshot is fetched, and drift items render with expected-vs-actual comparisons.

#### Reading the drift report

The `DriftItemList` renders each divergence as a card showing:
- **Field** — which structural field diverged (e.g. `spec.replicas`)
- **Expected** — the blueprint value with `bp-1` citation
- **Actual** — the live value with `live-1` citation
- **Severity** — `major` for replicas, image, and memory; `minor` for CPU

The report status explains the overall outcome:
- **`in_sync`** — no drift items; the live state matches the blueprint on all compared fields
- **`drifted`** — at least one field diverges and no tool limitations were recorded
- **`partial`** — drift exists but at least one tool limitation is present
- **`insufficient_evidence`** — the blueprint was not supplied, or the workload could not be resolved/snapshotted

#### Replaying a past run

Append `?run=<id>` to the page URL. The run's persisted events replay in order.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: `yarn typecheck --force` fails with missing exports from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed in the backend module's `package.json` as `"workspace:*"` and that you've run `yarn install` after adding it.

### Agent Execution Failures

**"Drift detector requires ai.agents.driftDetector configuration to be set" at boot**

The module fast-fails at backend startup. Add the minimal config with `model` set.

**Every run shows `insufficient_evidence`**

The blueprint must be caller-supplied — the shared Scaffolder template reader is not yet registered. Ensure you're providing a `blueprint` object in your `DriftCheckRequest` with at least one comparison field (replicas, image, or limits). Without a blueprint, the graph terminates immediately with no comparison attempted.

**Image and resource limit comparisons never produce drift**

The current `normalizeLiveSnapshot()` function in `liveState.ts` hardcodes `image: undefined` and `limits: undefined` — the Kubernetes workload snapshot type defines these fields but the extraction has not been implemented yet. Only `spec.replicas` comparisons can produce drift items in the current version. Image and resource limit fields are structural placeholders for a future live-state extraction enhancement.

**"Cloud topology reconciliation is unavailable" appears in every report**

This is a persistent limitation — the shared `cloud.resource.*` tool contracts have not been normalized yet. Cloud infrastructure drift (load balancers, databases, networks) cannot be detected until the cloud provider modules register these tools. The limitation is advisory and does not affect Kubernetes-level comparisons.

**"Remediation PR creation is unavailable" appears in every report**

This is a persistent limitation — the shared `vcs.pull_request.create` write tool has not been registered yet. The drift detector is read-only and detect-only. The `remediate` flag in the request and the `remediate.enabled` config key are accepted but only record a limitation — they do not attempt any write action.

### Frontend Issues

**Page loads but "Run drift check" does nothing**

Ensure `playwright/.auth/login.json` exists. The API client requires Backstage identity credentials.

**DriftItemList shows no items after a check**

The report status may be `in_sync` (no fields diverged) or `insufficient_evidence` (blueprint missing or workload unresolvable). If the blueprint only specified fields that are not yet extracted from the live snapshot (image, CPU limit, memory limit), no comparison is attempted for those fields.

---

## Roadmap

The following features are planned for future releases once shared infrastructure dependencies or Scafolder template contracts are available.

### Live-State Image & Resource Extraction

`normalizeLiveSnapshot()` currently hardcodes `image: undefined` and `limits: undefined`. The `KubernetesWorkloadSnapshot` type carries container image and resource limit data — extracting these fields will enable drift detection across all four comparison fields. Implementation involves:

- Mapping the first container's image and resource limits from the pod snapshot data
- Extending `liveEvidence()` to include image and resource limit details in the evidence summary
- No model, tool, or API changes required — it is a pure data extraction enhancement in `liveState.ts`

### Shared Scaffolder Blueprint Reader

The blueprint must currently be supplied manually by the caller. When a shared Scaffolder template/provenance reader contract is registered:

- The graph will resolve the entity's original Scaffolder blueprint from the template provenance store
- Blueprint fields (replicas, image, limits) will be extracted automatically from the template definition
- Manual blueprint form fields will be replaced with an auto-resolved display of the golden-path expectations
- Runs without a stored provenance entry will produce `insufficient_evidence` with a clear limitation

### Cloud Topology Reconciliation

Gated on normalized `cloud.resource.lookup` / `cloud.resource.dependencies` tools. When available:

- The graph will resolve cloud infrastructure associated with the catalog entity (load balancers, databases, networks, IAM)
- Cloud resource topology will be compared against the Scaffolder template's expected cloud resources
- Cloud-level drift items will be included in the `DriftReport` alongside Kubernetes-level items
- Cloud cost estimation will provide financial delta context for drifted resources

### IaC File Drift Detection

The `vcs.repository.read_file` tool is registered in the allow-list but not yet invoked. When the Scaffolder blueprint reader is available:

- The graph will read the component's declared IaC files (`infraPaths`) from the source repository
- Terraform, Helm, and Kubernetes YAML files will be compared line-by-line or structurally against the canonical template versions
- IaC-level drift items will cite file paths and line numbers alongside live-state items

### Remediation Patch Engine & VCS Write

Gated on `vcs.pull_request.create` (`effect: 'write'`). Once the shared write tool lands:

- A pure patch engine will compute a differential update to bring the live state back to golden-path expectations
- The graph will emit an `approval_request` event after the drift report is finalized
- After a human `approved` decision, the graph will open a PR against the component's repository with the remediation patch
- IaC file updates and resource spec updates will be proposed in a single, reviewable PR

### Fleet Sweep Scheduler

The `sweep` config block and `drift-fleet-sweep` trigger are registered but the module has no scheduler dependencies. When fleet scheduling is implemented:

- Register a `coreServices.scheduler` task for periodic drift scanning across the configured `entityRefs`
- Dispatch one drift check per entity, capped at `maxSweepComponents`
- Fleet runs are always detect-only and never auto-remediate

### AI-Powered Narrative Generation

The `modelRef` and `systemPrompt` are reserved for future AI-generated narrative that will produce a human-readable summary from deterministic drift items, including severity-based prioritization, recommended actions, and estimated time-to-remediate.

### Playwright E2E Test Suite

- `app-config.e2e.yaml` fixture backend with controlled Kubernetes fixture data
- Playwright scenarios covering full happy-path drift detection, `in_sync`, `insufficient_evidence`, and replay recovery
- Screenshot-based review of the drift item list with expected-vs-actual rendering
