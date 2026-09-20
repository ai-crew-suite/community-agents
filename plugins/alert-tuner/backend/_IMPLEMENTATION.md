# Alert Fatigue Tuner Implementation Plan

## Overview

This plugin analyzes alerting matrices to suppress noisy or redundant indicators automatically. This assistant operates a **highly sensitive write-back workflow**. It reads alert resolution histories, cross-references infra changes, calculates statistical thresholds, and modifies Infrastructure-as-Code (IaC) files directly.

- **The Task:** Reducing Alert Fatigue.
- **The Logic:** An agent monitors your PagerDuty or Opsgenie alerts. If an alert is triggered but consistently closed without any code changes or manual action (false positives), the agent opens a PR to your Terraform repository to tweak the threshold of that specific Prometheus alert.

## Goal

Implement `@ai-crew-suite/agent-alert-tuner-backend` as an AI Core backend module that reduces alert fatigue. It reads a bounded window of alert firing history, statistically isolates alert definitions that fire repeatedly and clear themselves without human action, correlates each candidate against deploys/incidents to rule out real signal, locates the threshold expression in the owning Infrastructure-as-Code file, and computes a **capped** threshold/duration patch. The patch is published as a reviewable proposal artifact and — only after **explicit human approval** — opened as a pull request against the infrastructure repository. A paired frontend plugin drives the evaluation, renders the statistical evidence and exact diff, and owns the approve/reject gate.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **statistical noise scoring**, an **anchored IaC patch engine**, and an approval-gated write into an IaC repository.

## Delivery Boundary

### In scope

- Evaluate one alert definition (or one service's alert set) per run for a trailing window, via the generic `/agents/alert-ai-tuner/runs` route.
- Deterministic `observe -> analyze -> locate -> patch -> gate` graph. Statistics and patch construction are pure code; the model only writes human-readable justification copy.
- Bounded reads over alert history, incidents, deploy/scaling timelines, and IaC source — all through registered read-only AI Core tools.
- Optional RAG via `knowledge.retrieve` for alerting-standards/runbook context used in the justification body only.
- A structured, citation-required `AlertTuningProposal` artifact, an `approval_request` event, and — on approve — an `AlertTuningPublication` artifact.
- Optional weekly scheduled sweeps that stop at the proposal/approval gate; scheduled runs never auto-publish.
- A minimal frontend: evaluate action, live SSE run view, noise-evidence panel, unified-diff preview, approve/reject bar, publication banner.

### Explicitly out of scope for v1

- **Autonomous IaC writes.** The PR is opened only after a persisted human `approved` decision; scheduled runs pause at the gate.
- Deleting or disabling alert definitions, editing escalation policies, silencing/muting alerts in the provider, or mutating incident state.
- Applying infrastructure (`terraform apply`), merging the PR, or touching branch protection.
- Multi-repository or fleet-wide bulk retuning; one alert definition + one IaC file per run.
- Inventing alert thresholds for definitions with no statistical basis (below `minSamples` the run terminates as `insufficient_evidence`).

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `pagerduty.service` / `github.service` `createServiceFactory` sketches (including `getHistoricalAlerts` / `getFileContent` / `createPullRequest`) must not be implemented; drive registered tool IDs through the workflow context.

**Hard gate — the IaC write capability does not exist today.** All `vcs.*` tools are `effect: 'read'`; there is no branch/commit/PR operation anywhere in `VcsDriver`.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Alert firing history | `incident.alert.history` | **Exists**, `effect: read`; `IncidentManagementDriver.getAlertHistory(query: AlertHistoryQuery)` returns `AlertHistoryEntry[]` carrying `alertId`, `title`, `service`, `severity`, `triggeredAt`, `resolvedAt`, `resolution: 'auto' \| 'manual' \| 'unresolved'`, `paged` | This is the primary signal. `resolution: 'auto'` + short `resolvedAt - triggeredAt` + `paged: false` is the false-positive fingerprint. Window-bound via `TimeRange`; clamp `limit`. |
| Rule out real signal | `incident.incident.list`, `incident.incident.get` | Exist, `effect: read` | Suppress a candidate when a real incident overlapped its firings. |
| Deploy/scaling correlation | `kubernetes.workload.get_timeline`, `kubernetes.workload.list_events` | Tools exist; Backstage-aware diagnostics gated by responder Milestone 0 | Same gate; do not duplicate it. Absent tool becomes a proposal limitation and forces `confidence: 'low'`. |
| Threshold headroom check | `observability.metrics.query` | Exists, `effect: read` (observability module, Datadog driver) | Optional: verify the proposed threshold still sits above observed peaks. Absent driver degrades to history-only reasoning. |
| Read the IaC source | `vcs.repository.read_file`, `vcs.repository.search`, `vcs.repository.get_metadata` | Exist, `effect: read` | `search` locates the alert block when the caller omits a path; `read_file` fetches exact text; `get_metadata` supplies the default branch for the PR base. |
| Alerting standards context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional; justification copy only. It must never influence the numeric proposal. |
| **Open the tuning PR (write)** | `vcs.branch.create` + `vcs.pull_request.create` (**new, `effect: 'write'`**) | **Not present** — no write-capable VCS tool exists; `VcsDriver` exposes only `getRepositoryMetadata`, `readFile`, `searchRepository`, `listPullRequests` | Add a provider-neutral `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` op to `VcsDriver` and register a `vcs.pull_request.create` tool declared `effect: 'write'`, so AI Core's approval policy pauses the run before it executes. **Blocking for the publish milestone.** Shared with `scaffolder-ai-drift-detector` (remediation PRs) — build it once in `plugin-ai-core-backend-module-vcs`. |
| Human approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** — approval types, `resume(runId, decision, context)`, `approval_request` event, checkpoint store, and `recordWriteAction` are all defined | Implement `AlertTunerGraph.resume()`; checkpoint the frozen patch before the gate; audit the decision, actor, repo/path, and patch hash. |
| Scheduled sweeps | `coreServices.scheduler` + `discovery` + `auth` | Available | Schedule in-module; dispatch authenticated plugin-to-plugin POSTs; sweeps stop at the gate. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ:

```text
plugins/backend/plugin-ai-agent-backend-alert-ai-tuner/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts
    module.ts           # registers runner, agent, triggers, scheduler sweep
    agent.ts            # ALERT_AI_TUNER_AGENT_ID, tool allow-list, system prompt
    config.ts           # readAlertAiTunerConfig (ai.agents.alertAiTuner)
    workflow/
      AlertTunerGraph.ts        # WorkflowRunner id 'alert-tuning' (run + resume)
      state.ts                  # AlertTuningState
      history.ts                # AlertHistoryEntry[] -> bounded, window-clamped FiringSample[]
      noise.ts                  # pure statistics: FiringSample[] -> NoiseScore
      correlate.ts              # incident/deploy overlap suppression (pure predicates)
      locate.ts                 # IaC anchor discovery -> ThresholdAnchor
      patch.ts                  # capped threshold/duration math + anchored unified diff
      proposal.ts               # AlertTuningProposal schema, validation, degradation
      publish.ts                # approval-gated vcs.pull_request.create step
    scheduler/
      weeklySweep.ts            # coreServices.scheduler registration (e.g. Monday 06:00)
      sweepPlanner.ts           # pure: alert/service inventory -> bounded dispatch plan
    services/
      AlertHistoryReader.ts     # incident.alert.history adapter, window + limit clamps
      IacSourceResolver.ts      # vcs.repository.search/read_file/get_metadata adapter
      TunerToolRunner.ts        # capped invokeTool facade (mirrors InvestigationToolRunner)
      TunerArtifactWriter.ts
    __tests__/
    workflow/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-alert-ai-tuner'`.
- `module.ts` deps: `coreServices.rootConfig`, `logger`, `scheduler`, `discovery`, `auth`, `catalogServiceRef`, `urlReader`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/agent-alert-tuner-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`, grouped with the other `@webstackbuilders` module loads.
- **VCS module gate**: publishing needs the new `vcs.pull_request.create` write tool in `plugin-ai-core-backend-module-vcs` plus a configured write-capable provider driver. Proposal-only runs (no PR) work today without it.
- **App config**: the module throws at boot without `ai.agents.alertAiTuner.model`; add the config block (see Configuration) before enabling the load. Publishing additionally requires `ai.agents.alertAiTuner.publish.enabled: true`.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-alert-tuner-backend": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'alert-ai-tuner',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'alert-ai-tuner'
  workflowRef: 'alert-tuning',
  memory: 'none',                     // each evaluation is a fresh statistical window
  systemPrompt: ALERT_AI_TUNER_SYSTEM_PROMPT,
  toolIds: [
    'incident.alert.history',
    'incident.incident.list',
    'incident.incident.get',
    'kubernetes.workload.get_timeline',
    'kubernetes.workload.list_events',
    'observability.metrics.query',
    'vcs.repository.get_metadata',
    'vcs.repository.search',
    'vcs.repository.read_file',
    'knowledge.retrieve',
    'vcs.pull_request.create',        // effect: 'write' — NEW; only invoked post-approval
  ],
  triggers: [
    { id: 'alert-tuning-on-demand', source: 'manual', agentId: 'alert-ai-tuner' },
    { id: 'alert-tuning-weekly-sweep', source: 'scheduler', agentId: 'alert-ai-tuner' },
  ],
}
```

- Read tools run freely. `vcs.pull_request.create` is `effect: 'write'`, so AI Core pauses with an `approval_request` before it executes — the plugin must not bypass this. Omit it from the allow-list until it lands; the workflow then terminates at the proposal artifact (propose-only mode).
- `observability.metrics.query` and the `kubernetes.*` timeline tools are optional: absence is recorded as a proposal limitation and caps `confidence` at `low`.
- System prompt rules: never compute or restate numbers — thresholds, durations, sample counts, and the noise ratio are supplied pre-computed and must be quoted verbatim; cite `fire-N`/`inc-N`/`iac-N`/`kb-N` evidence IDs for every claim; never invent alert names, file paths, or line numbers; write only the PR title/body and the human-readable justification; when the supplied evidence shows a real incident overlap, state that no tuning is warranted.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type AlertTuningRequest = {
  version: 1;
  source: 'manual' | 'scheduler';
  alertId?: string;              // one alert definition; else service-scoped candidate selection
  service?: string;              // required when alertId is absent
  entityRef?: string;            // optional catalog component for annotations/ownership
  windowDays?: number;           // trailing analysis window, default 14, clamped
  repoUrl?: string;              // IaC repo override; else from source-location annotation
  iacPath?: string;              // exact file, e.g. 'alerts.tf'; else vcs.repository.search
  publish?: boolean;             // request the PR path (still gated); default false
};
```

Validation requires `alertId` **or** `service`, clamps `windowDays` and the history `limit`, bounds `iacPath`, and forces the publish path through the approval gate regardless of caller intent.

## Tuning Workflow

`AlertTunerGraph` registers as `WorkflowRunner` id `alert-tuning` and implements **both** `run()` and `resume()`. It realizes the foundation doc's flow: **Observe → Threshold Analysis → File Modification → HITL Gate → PR**. Statistics and the patch are deterministic code; the LLM only narrates.

### Deterministic graph nodes

1. **observe** — validate `AlertTuningRequest`; read `incident.alert.history` through `AlertHistoryReader` with the clamped `TimeRange`/`limit`. `history.ts` normalizes entries into `FiringSample[]` (`fire-N` evidence): `triggeredAt`, `resolvedAt`, derived `durationSeconds`, `resolution`, `paged`. Fewer than `minSamples` firings → terminal `insufficient_evidence`, **no model call**.
2. **analyze** — `noise.ts` (pure, no LLM) computes a `NoiseScore`: firing count, auto-resolve ratio, median/p90 self-clear duration, share of firings under `selfClearSeconds`, paged share. A candidate is *noisy* only when count ≥ `minSamples`, auto-resolve ratio ≥ `autoResolveRatio`, and median duration ≤ `selfClearSeconds` — the foundation doc's "fires 20×/week, auto-closes in 2 minutes" fingerprint.
3. **correlate** — `correlate.ts` suppresses false candidates using `incident.incident.list`/`get` (`inc-N`) and, when available, `kubernetes.workload.get_timeline`/`list_events`: any firing overlapping a real incident or a remediating deploy/scale event marks the alert as **real signal** → status `not_noisy`, no patch. Absent K8s/observability tools become limitations and cap `confidence` at `low`.
4. **locate** — `IacSourceResolver` resolves the repo (`repoUrl` or the catalog `source-location` annotation) and the base branch via `vcs.repository.get_metadata`, then finds the alert block: `vcs.repository.search` when `iacPath` is absent, `vcs.repository.read_file` for exact text. `locate.ts` produces a `ThresholdAnchor` — file path, matched block, the exact `threshold`/`duration` assignment lines and their line numbers. No unambiguous single anchor → terminal `anchor_not_found` (never guess a file).
5. **patch** — `patch.ts` (pure, no LLM) derives new values from the anchor's current values and the `NoiseScore`, **capped** by `maxThresholdIncreasePct` and `maxDurationMultiplier` and floored at the observed peak from the optional `observability.metrics.query` headroom check. It emits an **anchored** unified diff replacing only the matched assignment lines, validated to apply cleanly against the read file. One model call then writes the justification/PR body from the supplied numbers. Emits the `alert-tuning-proposal` artifact.
6. **gate** — when `publish` is requested, a valid patch exists, `vcs.pull_request.create` is registered, and `publish.enabled`, emit `approval_request` (`effect: 'write'`), checkpoint the frozen patch, and **suspend**. Propose-only and scheduled runs finish at the proposal artifact.
7. **publish** *(resume path)* — `resume(runId, decision, context)`: on `approved`, re-validate the frozen anchor/patch against the head of the base branch, open the PR via `vcs.pull_request.create`, emit an `alert-tuning-publication` artifact + audit record, then `done`; on `rejected`, persist the decision, mark the proposal `declined`, and finalize without any write.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'alert' | 'incident' | 'deploy' | 'metric' | 'iac' | 'knowledge'; summary: string; reference?: string };

type FiringSample = {
  id: string;                     // 'fire-1' ...
  triggeredAt: string;
  resolvedAt?: string;
  durationSeconds?: number;
  resolution: 'auto' | 'manual' | 'unresolved';
  paged: boolean;
};

type NoiseScore = {               // deterministic; the model may not alter these
  samples: number;
  autoResolveRatio: number;       // 0..1
  medianSelfClearSeconds: number;
  p90SelfClearSeconds: number;
  pagedRatio: number;
  verdict: 'noisy' | 'real_signal' | 'inconclusive';
  suppressedBy?: string[];        // inc-N / deploy evidence IDs that ruled out noise
};

type ThresholdAnchor = {
  path: string;                   // 'alerts.tf'
  blockName?: string;             // 'prometheus_alert.cpu_high'
  currentThreshold?: { value: number; line: number; raw: string };
  currentDuration?: { value: string; line: number; raw: string };  // '2m'
  evidence: string[];             // iac-N
};

type ThresholdChange = {
  field: 'threshold' | 'duration';
  from: string;
  to: string;                     // capped by config; never exceeds observed peaks
  rationale: string;              // model copy, must cite fire-N / metric evidence
};

type FilePatch = { path: string; diff: string };   // anchored unified diff, validated

// AlertTuningState: { request, samples: FiringSample[], score?: NoiseScore,
//   anchor?: ThresholdAnchor, changes: ThresholdChange[], patch?: FilePatch,
//   limitations: string[],
//   status: 'noisy'|'not_noisy'|'insufficient_evidence'|'anchor_not_found'|'declined'|'partial' }

type AlertTuningProposal = {
  alertId: string;
  service?: string;
  status: AlertTuningState['status'];
  window: { from: string; to: string };
  score?: NoiseScore;
  anchor?: ThresholdAnchor;
  changes: ThresholdChange[];
  patch?: FilePatch;
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];        // fire-N + inc-N + iac-N (+ metric/kb) bundle
};

type AlertTuningPublication = {
  alertId: string;
  repoUrl: string;
  baseBranch: string;
  headBranch: string;             // e.g. 'alert-tuner/cpu-utilization-high'
  pullRequestUrl: string;
  proposalRef: string;            // artifact ref of the approved AlertTuningProposal
  patchHash: string;              // matches the checkpointed, approved patch
  decidedBy: string;
};
```

Verdict → status mapping is fixed in code, not inferred: `noisy` → `noisy` (patch path), `real_signal` → `not_noisy`, `inconclusive` → `not_noisy` with the blocking statistic named in `limitations`. `partial` is reserved for a noisy verdict whose evidence sources were incomplete (missing metrics/K8s tools) and therefore carries `confidence: 'low'`.

## Statistical Noise Engine (New Structural Section)

The foundation doc's core requirement is that the *tuning decision itself* is arithmetic, not inference.

- `noise.ts` is a pure module with no AI Core, tool, or clock dependencies: `(samples: FiringSample[], thresholds: NoiseThresholds) => NoiseScore`. Every branch is unit-testable against fixture arrays.
- Durations come from `resolvedAt - triggeredAt`; `resolution: 'unresolved'` samples are counted in `samples` but excluded from duration statistics and never count as auto-resolve evidence.
- **Percentiles, not means** — a single multi-hour outage must not mask 15 two-minute self-clears; `medianSelfClearSeconds` drives the verdict, `p90SelfClearSeconds` feeds the safety cap.
- `pagedRatio` is a hard brake: an alert that consistently pages a human is human-actioned by definition, so a high paged share forces `verdict: 'inconclusive'` even when auto-resolve is high.
- `correlate.ts` holds the suppression predicates (interval overlap between a firing and an incident/deploy window, with a configurable `correlationWindowMinutes` pad). Any overlap yields `verdict: 'real_signal'` and lists the suppressing evidence IDs — the plugin's guard against tuning away a genuine failure signal.
- The model is invoked **only after** the verdict is fixed, and the verdict/score object is passed into the prompt read-only; `proposal.ts` re-validates that the model's copy did not restate different numbers, degrading to a fact-only proposal when it does.

## Anchored IaC Patch Engine (New Structural Section)

Threshold edits must be a surgical string replacement in real infrastructure code, per the foundation doc.

- `locate.ts` matches the alert definition by name/title against the read file using bounded, provider-agnostic block patterns (HCL `resource "..." "..." { ... }` and Prometheus-rule YAML `- alert: <name>` with `expr`/`for`), capturing the exact `threshold`/`duration`/`for` assignment lines **with line numbers**. Ambiguity (zero or multiple matches) is a terminal state, never a guess.
- `patch.ts` computes the capped new values and emits a unified diff anchored to those line numbers, preserving surrounding whitespace and comment style byte-for-byte. Only the matched assignment lines may appear as changed hunks; a diff touching any other line is rejected as invalid.
- Safety caps are all deterministic: `maxThresholdIncreasePct`, `maxDurationMultiplier`, and — when `observability.metrics.query` is available — a floor that keeps the new threshold above the observed peak plus `peakHeadroomPct`. The absent-metrics path is allowed but recorded as a limitation with `confidence: 'low'`.
- The patch is verified to apply against the exact file content read in **locate** before the gate, and its `patchHash` is checkpointed. On resume, the base branch head is re-read and the patch re-verified; a drifted file aborts the publish with a clear terminal reason rather than force-pushing a stale change.
- Both LLM-authored fields (PR title, PR body) are text-only; no code path lets model output reach the diff.

## Human Approval Gate

- The gate uses the existing `ApprovalRequest`/`ApprovalDecision` types, `CheckpointStore`, and `AuditLogSink` — no new machinery. The `approval_request` payload carries the proposal artifact ref, target `repoUrl`/`path`, the rendered diff, and `patchHash`.
- `resume()` is idempotent by `(alertId, patchHash)`: a repeated `approved` decision returns the existing publication instead of opening a second PR.
- `recordWriteAction` audits decision, `decidedBy`, repo/branch/path, `patchHash`, and the resulting PR URL. A rejected decision is audited too, so declined tuning is visible in review history.
- Scheduled runs may reach the gate but can never satisfy it: the service principal has no approval authority, so an unapproved sweep proposal simply expires as a pending artifact.

## Background Scheduler Tasks (Weekly Sweep)

- `scheduler/weeklySweep.ts` registers one `coreServices.scheduler` task: `id: 'alert-ai-tuner-weekly-sweep'`, `frequency: { cron }` from config (default `0 6 * * 1` — Monday morning, matching the foundation doc), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- `sweepPlanner.ts` (pure) turns the configured service/team inventory into a bounded dispatch plan capped at `maxSweepAlerts`, skipping alerts already proposed within `cooldownDays` (dedupe by `alertId` + `patchHash`).
- The task POSTs one run per planned alert to `/agents/alert-ai-tuner/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `publish: true`. It never runs the graph in-process.
- **Sweeps stop at the proposal/approval gate and never open a PR autonomously.** Guardrails: per-sweep cap, sequential dispatch with delay, in-flight mutex, per-alert cooldown, kill switch `sweep.enabled` (default **false**).

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` is a secondary path used to pull the org's alerting standards/runbook language into the PR body so reviewers see *why* the threshold policy allows the change. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; run/checkpoint state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** influence `NoiseScore`, the verdict, or any numeric value in `ThresholdChange`; it is prose context only. Tests mock `context.invokeTool` for `knowledge.retrieve` with pre-baked alerting-standard fixtures and assert the numbers are byte-identical with and without retrieval.

## Configuration

```yaml
ai:
  agents:
    alertAiTuner:
      model: alert-ai-tuner         # installation-registered model ID, required
      windowDays: 14                # optional, default 14 trailing analysis window
      maxWindowDays: 30             # optional, default 30 hard clamp
      maxHistoryEntries: 500        # optional, default 500 (clamps incident.alert.history limit)
      maxToolInvocations: 16        # optional, default 16
      noise:
        minSamples: 8               # optional, default 8; below this -> insufficient_evidence
        autoResolveRatio: 0.8       # optional, default 0.8
        selfClearSeconds: 300       # optional, default 300 (5m median self-clear)
        maxPagedRatio: 0.2          # optional, default 0.2; above this -> inconclusive
        correlationWindowMinutes: 15  # optional, default 15 incident/deploy overlap pad
      patch:
        maxThresholdIncreasePct: 15   # optional, default 15
        maxDurationMultiplier: 3      # optional, default 3 (e.g. 2m -> max 6m)
        peakHeadroomPct: 10           # optional, default 10 above observed peak
        iacPaths:                     # optional; searched when iacPath is omitted
          - 'alerts.tf'
          - 'prometheus-rules.yaml'
          - 'monitoring/**'
      sweep:
        enabled: false              # optional, default false
        cron: '0 6 * * 1'           # optional, default Monday 06:00
        maxSweepAlerts: 25          # optional, default 25
        cooldownDays: 30            # optional, default 30 per-alert re-proposal cooldown
      publish:
        enabled: false              # optional, default false; gates vcs.pull_request.create
        branchPrefix: alert-tuner   # optional, default 'alert-tuner'
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Publishing requires **both** `publish.enabled: true` and the `vcs.pull_request.create` tool being registered — either missing yields propose-only runs with a limitation, never a silent skip of the gate.

## Shared AI-Core Work To Build First

- **VCS pull-request-creation write (blocking for publish)** — add a provider-neutral `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` (and the branch/commit primitives it needs) to `VcsDriver`, implement it in at least the GitHub driver, and register `vcs.pull_request.create` with `effect: 'write'` in `plugin-ai-core-backend-module-vcs`. **Shared with `scaffolder-ai-drift-detector`** (remediation PRs) — build it once; whichever plugin lands first owns it.
- **Kubernetes deploy-timeline gate** — the `kubernetes.workload.get_timeline`/`list_events` Backstage-aware diagnostics are gated by responder Milestone 0; reuse when landed, do not duplicate. Absent → limitation + `confidence: 'low'`.
- **`CatalogEntityResolver` (shared, still unbuilt)** — reuse for `entityRef` → repo/annotation resolution when landed; otherwise a local `catalogServiceRef` adapter in `IacSourceResolver`.
- **No new statistics, approval, or persistence machinery in core** — `noise.ts`/`patch.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, and runtime stores all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring (`alpha.ts`, `extensions/`, self-contained wire types in `@types/`, SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay). The distinguishing UI is the **noise-evidence panel + diff preview + approval bar**.

```text
plugins/frontend/plugin-ai-agent-frontend-alert-ai-tuner/
  src/
    index.ts
    alpha.ts
    plugin.ts
    routes.ts                     # rootRouteRef for the alert tuning page
    @types/index.ts               # AlertTuningRequest/Proposal/Publication wire types
    api/
      apiRef.ts
      client.ts                   # AlertTunerClient: evaluateAlert(), streamRunEvents(), submitApproval(), listProposals()
      index.ts
    hooks/
      useAlertTuningRun.ts        # pure reducer + hook (evaluate/approve/reject/reset)
      useProposalList.ts          # recent proposals for the noise dashboard
    components/
      index.ts
      AlertTunerPage.tsx          # standalone: proposal list + on-demand evaluation
      ProposalTable.tsx           # alert, firing count, auto-resolve ratio, status, deep links
      EvaluateAlertDialog.tsx     # alertId/service/windowDays/publish inputs
      TuningRunView.tsx           # live node/tool progress from SSE
      NoiseEvidencePanel.tsx      # NoiseScore stats + fire-N/inc-N citations
      ThresholdDiffPreview.tsx    # unified-diff viewer for the anchored IaC change
      ApprovalBar.tsx             # approve/reject the tuning PR
      PublicationBanner.tsx       # opened-PR link on success
    extensions/
      api.ts
      components.ts
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'alert-ai-tuner'`; package `@ai-crew-suite/plugin-agent-alert-tuner-backend`.
- Primary surface is a **standalone tuning page** (nav item) listing proposals; a secondary entity card shows the owning component's open tuning proposals.
- `evaluateAlert()` POSTs `/agents/alert-ai-tuner/runs` with the JSON `AlertTuningRequest`; the proposal renders from the `alert-tuning-proposal` artifact; `ThresholdDiffPreview` renders `patch.diff`.
- **Approval UX**: on `approval_request`, `ApprovalBar` shows the exact diff, target repo/path, and `patchHash`, then posts an `ApprovalDecision`; on approve `PublicationBanner` links the PR; on reject the proposal renders as `declined`.
- `not_noisy` / `insufficient_evidence` / `anchor_not_found` render as first-class, explained outcomes (not errors), with `limitations` and `confidence` always visible; no numeric value is displayed without its `fire-N`/`iac-N` citations.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `noise.ts` verdict matrix — 15 auto-resolved 90-second firings → `noisy`; the same set with a 4-hour outage appended → median unaffected, still `noisy`; high `pagedRatio` → `inconclusive`; 3 samples → `insufficient_evidence`. `patch.ts` cap arithmetic (`85 → 90`, never `85 → 300`; `2m → 5m` within `maxDurationMultiplier`), diff anchoring, and rejection of diffs touching unmatched lines. `locate.ts` HCL + Prometheus-YAML anchor extraction with zero-match and multi-match terminals. `correlate.ts` overlap padding. `sweepPlanner.ts` caps/cooldown.
- **Workflow (runtime) tests**: drive `AlertTunerGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `pagerduty.service`/`github.service` `createServiceFactory` sketches. Headline scenario (the foundation doc's own test): `incident.alert.history` returns 15 `CPU Utilization exceeds 85%` entries with `resolution: 'auto'`, ~90s duration, `paged: false`; `vcs.repository.read_file` returns the `prometheus_alert "cpu_high"` HCL block; assert the run produces `threshold = 90` **or** `duration = "5m"` in an anchored diff, halts at `approval_request`, and invokes **no** write tool.
- **Approval-gate hardening** (foundation doc §2): assert the run stays suspended/pending-approval and `vcs.pull_request.create` is never invoked when the model emits a hallucinated tool call or tries to skip a node; `resume('approved')` opens the PR exactly once with the checkpointed `patchHash` + audit; `resume('rejected')` opens nothing and marks `declined`; a repeated approved resume is idempotent (no double PR); a base-branch file mutated between gate and resume aborts the publish.
- **Real-signal suppression tests**: identical noisy history plus one overlapping `incident.incident.list` entry (or a deploy event in `kubernetes.workload.get_timeline`) → `not_noisy`, no patch, `suppressedBy` populated — proving the agent cannot tune away a genuine signal.
- **Degradation tests**: missing `observability.metrics.query` driver → proposal still valid with a limitation and `confidence: 'low'`; missing `kubernetes.*` tool → limitation, not failure; `vcs.pull_request.create` absent → propose-only status with the gate never faked.
- **`knowledge.retrieve` isolation**: pre-baked alerting-standard chunks selected by query substring; assert `NoiseScore` and `ThresholdChange` values are byte-identical with retrieval enabled and disabled.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards to the Monday tick; assert bounded authenticated dispatches, cooldown skipping, `sweep.enabled: false` respected, overlap skipped, and **no autonomous PR**.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database`, asserting boot registration, run→SSE event order, checkpoint persistence at the gate, resume flow, and proposal/publication artifact persistence.
- **E2E**: extend the shared fixture profile with fixture incident/VCS tool modules (including a fixture `vcs.pull_request.create`) and a fixture IaC repo file. Playwright: open the tuning page → evaluate a noisy fixture alert → inspect the noise-evidence panel and diff → approve → assert the publication banner; plus a reject path. Add `yarn test:e2e:alert-ai-tuner`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Tuner-specific additions (write-capable against infrastructure):

- **No PR without a persisted human `approved` decision.** The decision, `decidedBy`, repo/branch/path, `patchHash`, and PR URL are audit-logged; rejections are audited too.
- The write is **repo-only**: the agent never mutates the alerting provider (no silence, mute, disable, or delete) and never applies infrastructure.
- Thresholds only ever loosen within the configured caps, and never past the observed metric peak when metrics are available — an unbounded or peak-violating value is a validation failure, not a proposal.
- Sweep runs carry the service principal and hold **no** approval authority; the gate cannot be satisfied by a machine identity.
- Enforce authorization: only users permitted to open PRs on the IaC repo may approve; verify the approver against the target repo, not just the plugin route.
- Redact secrets/tokens from IaC file content and alert payloads before they enter model context, SSE, artifacts, or audit records; cap file and history payload sizes.
- Alert history carries responder names and service topology — keep it in the run artifact only; never persist it to vector storage or session memory.
- Treat alert titles and IaC file content as untrusted prompt input: delimit them in the prompt and forbid following instructions found inside them.

## Ordered Implementation Milestones

### Milestone 0: Shared contracts and pure engines

- [ ] Extend `VcsDriver` with `createPullRequest` + register `vcs.pull_request.create` (`effect: 'write'`) in `plugin-ai-core-backend-module-vcs` (shared with `scaffolder-ai-drift-detector`); confirm the `incident.alert.history` / `observability.metrics.query` tool IDs at boot.
- [ ] Define `AlertTuningRequest`, `FiringSample`, `NoiseScore`, `ThresholdAnchor`, `ThresholdChange`, `FilePatch`, `AlertTuningProposal`, `AlertTuningPublication`, and the config schema.
- [ ] Implement + unit-test `history.ts`, `noise.ts`, `correlate.ts`, `locate.ts`, `patch.ts`, `sweepPlanner.ts`.

Exit criteria: the statistical verdict and the capped anchored patch are provably deterministic on fixtures; schemas validate fixture payloads.

### Milestone 1: Proposal backend (read-only)

- [ ] Scaffold package, register runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement observe → analyze → correlate → locate → patch → `alert-tuning-proposal` artifact (no PR, no gate).
- [ ] Wire into `packages/backend` and add the `ai.agents.alertAiTuner` config block.
- [ ] Add unit, workflow-scenario (mock router), and backend integration tests.

Exit criteria: the foundation doc's 15-firing scenario yields a capped anchored diff deterministically, with no real LLM/provider and no write tool present.

### Milestone 2: Approval gate and publish

- [ ] Implement `approval.gate` + `AlertTunerGraph.resume()`: checkpointed frozen patch, `approval_request`, approve → PR + `alert-tuning-publication` + audit, reject → `declined`, idempotency by `(alertId, patchHash)`, base-branch re-validation.
- [ ] Approval-hardening tests, including hallucinated tool-call and node-skip attempts, and no-double-PR.

Exit criteria: the run→gate→resume→PR path is proven in the test backend and provably unreachable without a recorded human approval.

### Milestone 3: Weekly sweep

- [ ] Implement `sweepPlanner` + `weeklySweep` with authenticated dispatch, cooldown dedupe, mutex, and kill switch.
- [ ] Scheduler tests with fast-forwarded ticks; overlap, cooldown, and no-autonomous-PR coverage.

Exit criteria: a fast-forwarded Monday tick produces persisted, replayable proposals that all stop at the gate.

### Milestone 4: Frontend and E2E

- [ ] Implement the frontend (tuning page, evaluate dialog, SSE run view, noise-evidence panel, diff preview, approval bar, publication banner) and register it in `packages/app`.
- [ ] Component tests (loading, streaming, noisy/not-noisy/insufficient-evidence/anchor-not-found, approval request, approve/reject, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright approve and reject scenarios with screenshot review.

Exit criteria: `yarn test:e2e:alert-ai-tuner` demonstrates evidence → diff → approve → PR and a reject path in a browser without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, incident/observability/VCS driver configuration, sweep enablement, publish permissions, and the approval flow.
- [ ] Dashboards/alerts for failed runs, proposal rate, approval/rejection ratio, sweep duration, and model cost.
- [ ] Opt-in real-model evaluation suite (grounding: every claim cites supplied evidence IDs; no fabricated thresholds, files, or line numbers; quoted numbers match the pre-computed score) within budget.

Exit criteria: staged rollout with sweep and publish disabled by default, bounded costs, and verified approval auditing plus numeric grounding.

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, read allow-list, and the gated `vcs.pull_request.create` write tool implemented and registered (root + app/backend + VCS-module wiring included).
- Runs execute through the real AI Core controller/runtime with persisted replayable events, a checkpoint at the gate, token/cost usage, and `alert-tuning-proposal` / `alert-tuning-publication` artifacts.
- The noise verdict and the threshold/duration math are pure, deterministic, capped code — never model output — and a real-signal overlap provably blocks any patch.
- The patch is anchored to the located assignment lines, validated to apply before the gate and re-validated on resume; the approval gate provably blocks the PR until an `approved` decision and never double-opens.
- Frontend renders evidence, diff, and approve/reject over live SSE and replay; Playwright verifies both paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, alert PII beyond the run artifact, uncited numbers, or a PR write lacking a recorded human approval.

## Frontend Completed

## Backend Completed

Delivered **Milestone 0** (shared pure engines), **Milestone 1** (propose-only
backend), and **Milestone 3** (weekly sweep). Milestone 2's publish path was
deliberately not built — see "Contract limitations" below.

### Registered surface

- Workflow ID: `alert-tuning` (custom `WorkflowRunner`)
- Agent ID: `alert-ai-tuner`, `memory: 'none'`
- Artifact kind: `alert-tuning-proposal`
- Triggers: `alert-tuning-on-demand` (manual) and `alert-tuning-weekly-sweep`
- Read-only tool allow-list:
  - `incident.alert.history`
  - `incident.incident.list`
  - `observability.metrics.query`
  - `vcs.repository.get_metadata`
  - `vcs.repository.search`
  - `vcs.repository.read_file`

### Deterministic engines (pure, no LLM)

- `workflow/noise.ts` — nearest-rank percentiles, auto-resolve ratio, paged
  ratio, and the fixed verdict ladder. Unresolved firings count toward volume
  but never toward auto-resolve or duration statistics.
- `workflow/correlate.ts` — padded interval-overlap predicates; any real
  incident overlap flips the verdict to `real_signal` and removes the patch path.
- `workflow/locate.ts` — HCL `resource "..." "..."` blocks (brace-depth bounded)
  and Prometheus `- alert:` rule entries (indentation bounded), capturing
  threshold/duration assignments **with line numbers**. Zero and multiple
  matches are both terminal.
- `workflow/patch.ts` — capped arithmetic plus an anchored unified diff that
  preserves indentation, operator spacing, quoting, and trailing comments
  byte-for-byte, validated against the exact file it was cut from.
- `scheduler/sweepPlanner.ts` — bounded, deduplicated, cooldown-aware plan.

### Workflow behavior

`observe → analyze → correlate → locate → patch → alert-tuning-proposal`, with
first-class explained outcomes rather than errors: `noisy`, `partial`,
`not_noisy`, `insufficient_evidence`, `anchor_not_found`.

### Contract limitations (not fabricated)

The plan correctly identifies three missing shared contracts, and none were
invented:

- `vcs.pull_request.create` / `vcs.branch.create` (`effect: 'write'`) — no
  write-capable operation exists anywhere in `VcsDriver`, so the write tool is
  absent from the allow-list and the workflow terminates at the proposal
  artifact. Per the plan's own instruction ("Omit `vcs.pull_request.create` from
  the allow-list until it lands"), `publish.enabled: true` records a limitation
  rather than emitting a fake `approval_request`. `AlertTunerGraph.resume()` was
  therefore **not** implemented: a resume path with nothing to publish would be
  dead code advertising a gate that cannot exist.
- `kubernetes.workload.get_timeline` — gated on shared responder work; absence
  is a recorded limitation that caps `confidence` at `low`.
- `CatalogEntityResolver` — until it lands, an explicit `repoUrl` is required and
  annotation-based resolution reports `anchor_not_found`.

`patchApplies()` and the checkpointable `patchHash` are implemented and tested
now, so Milestone 2 can add the gate without reworking the patch engine.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

40 tests across 7 files:

- `noise`: the 15-firing / 90-second fingerprint → `noisy`; a 4-hour outage
  appended leaves both percentiles at 90s (a mean would land near 990s and hide
  the noise); high paged ratio → `inconclusive`; 3 samples → below floor;
  unresolved firings excluded from statistics.
- `correlate`: incident overlap → `real_signal` with `suppressedBy`;
  non-overlapping incident leaves the verdict intact; pad boundary behaviour.
- `patch`: `85 → 97` within the 15% cap and never to 300; peak-veto in both
  directions; `2m → 4m` and multiplier-bounded `6m`; diff touches only located
  lines and preserves the trailing comment; drifted file invalidates the patch.
- `locate`: HCL and Prometheus anchors with exact line numbers; no-match,
  ambiguous-match, and no-tunable-field terminals.
- `history` / `request`: derived durations, window filtering, newest-first cap,
  evidence free of alert titles, window clamping, traversal-path rejection,
  unsupported-version rejection.
- `AlertTunerGraph` (dynamic mock tool router keyed by tool ID): the headline
  scenario produces an anchored capped diff and invokes **no** write tool;
  degradation to `partial`/`low`; real-signal suppression; termination before any
  repository read below the floor; `anchor_not_found`; invalid-request rejection.
- `module`: runner/agent/trigger registration, allow-list contains no write
  tool, and boot fails without configuration.

### Bug found and fixed during validation

`cappedThreshold` originally returned `max(cap, peak + headroom)`, which could
exceed its own percentage cap when the observed peak was high. The observed peak
is now a **veto** rather than a raise: when the peak plus headroom will not fit
under the cap, no change is proposed at all, because loosening a threshold past a
value the service already exceeds would silently disable the alert.

### Not implemented here

Milestone 2 (approval gate and PR publish, blocked on the shared VCS write
tool), Milestone 4 (frontend and E2E), and Milestone 5 (production dashboards
plus the opt-in real-model evaluation suite).

## Frontend Completed

Implemented the alert fatigue tuner frontend plugin at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-alert-ai-tuner`

### Implemented surface

- Package: `@ai-crew-suite/plugin-agent-alert-tuner-backend`
- `backstage.role: frontend-plugin`, `backstage.pluginId: alert-ai-tuner`
- Legacy (`.`) and new frontend-system (`./alpha`) entry points
- Standalone page at `/alert-ai-tuner`, with `?run=<id>` replay
- Typed API client over discovery/fetch/identity APIs:
  - `evaluateAlert()` → `POST agents/alert-ai-tuner/runs`
  - `streamRunEvents()` → `GET runs/<id>/events` with `Last-Event-ID`
  - `submitApproval()` → `POST runs/<id>/approvals` (future typed surface)
- `useAlertTuningRun`: pure reducer plus live/replay/approval hook
- `EvaluateAlertDialog`, `TuningRunView`, `NoiseEvidencePanel`,
  `ThresholdDiffPreview`, `ApprovalBar`, and `PublicationBanner`

### Contract fidelity and current limitation

Wire types mirror the implemented backend's `AlertTuningRequest`,
`AlertTuningProposal`, `NoiseScore`, anchored `FilePatch`, and
`alert-tuning-proposal` artifact exactly. The current backend is proposal-only:
there is no VCS write tool, approval event, publication artifact, or proposal
list endpoint. The page therefore renders the live proposal/evidence/diff flow
and keeps approval/publication controls hidden unless real future SSE events
arrive; it does not fabricate a write gate, a PR link, or a dashboard list.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Still out of scope

An entity card and recent-proposal table require an actual backend proposal-list
endpoint; approval/reject browser tests and Playwright E2E require the shared
VCS write tool and real approval/publication events. Neither backend capability
was invented by this frontend plugin.
