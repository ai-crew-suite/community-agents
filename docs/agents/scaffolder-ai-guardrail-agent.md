---
layout: default
title: Scaffolder AI Guardrail Agent
parent: Scaffolder
plugin_name: plugin-ai-agent-backend-scaffolder-ai-guardrail-agent
subcategory: Governance
---

# Scaffolder AI Guardrail Agent

{: .no_toc }

<span class="label label-blue">{{ page.subcategory }}</span>

---

## Summary

The Scaffolder AI Guardrail Agent acts as a **pre-flight policy gate** for Backstage Scaffolder template submissions. Before any cloud resource is provisioned or repository is scaffolded, the agent evaluates the template's parameters against corporate architecture, security, and financial policies. Unlike a binary OPA pass/fail gate, it introduces a **negotiation layer**: when a request breaches a policy boundary (e.g., an unapproved database instance type in a test environment), the agent computes a deterministic safe alternative from the configured instance-type ladder, produces a cost estimate comparison, and suspends at a checkpointed approval gate. An authorized human can then accept the mutation, grant an exception, or halt the request.

The entire assessment is **deterministic**: policy evaluation, budget comparison, and mutation proposals are pure functions operating on compliance driver results. **No LLM is invoked.** The model reference in the agent definition is reserved for future narrative copy generation.

## Key Features

- **Policy adjudication engine** — evaluates each configured policy against the request parameters via `compliance.policy.evaluate`, with fail-closed defaults (unmatched rules default to `blocking` severity) and architecture validation via `compliance.architecture.validate`
- **Deterministic budget comparison** — compares `compliance.cost.estimate` output against the configured `thresholdUsd` ceiling, with per-environment budget overrides, producing `within_budget`, `over_budget`, or `undetermined` verdicts
- **Instance-type mutation ladder** — when a `negotiable` instance-type violation is detected, maps the request's current instance type against a configurable ladder and proposes the safest alternative at the bottom of the ladder as a deterministic `MutationProposal`
- **Seven assessment statuses** — `compliant`, `negotiable`, `escalate` (over budget with no mutation available), `blocked` (blocking violation), `undetermined` (cost undetermined), `resolved`, `halted`
- **Checkpointed negotiation gate** — for `negotiable` and `escalate` assessments, the graph checkpoints the assessment and emits a real `approval_request` SSE event, pausing until an authorized human accepts or rejects
- **Approver authorization check** — `resume()` verifies the approver's identity via `compliance.permission.check` before releasing any parameter set, with refusal audit logging
- **Parameter fingerprinting** — FNV-1a hash of `templateRef`, `requestedBy`, and canonicalized parameters enables idempotency detection across resubmissions
- **Secret redaction at intake** — parameter values whose keys match credential patterns (`token`, `password`, `secret`, `api_key`, `connection_string`) are replaced with `[REDACTED]` before entering evidence or artifacts

## Architecture

The plugin follows the standard two-package Backstage agent layout:

- **Backend module** (`@ai-crew-suite/plugin-agent-scaffolder-guardrail-backend`, `role: backend-plugin-module`, `pluginId: ai-core`) — registers the `GuardrailGraph` workflow runner (ID `scaffolder-guardrail`) with a **real `resume()` method** for the negotiation gate, the `scaffolder-ai-guardrail-agent` agent definition with 4 compliance tools, and a single manual trigger
- **Frontend plugin** (`@ai-crew-suite/plugin-agent-scaffolder-guardrail`, `role: frontend-plugin`, `pluginId: scaffoldinger-ai-guardrail-agent`) — provides a standalone page at `/scaffolder-ai-guardrail-agent` with an evaluation dialog, violation list, cost panel, mutation offer panel, approval bar, and resolution banner

The graph runs five nodes: `adjudicate` (policy + architecture evaluation against all configured policies) → `price` (cost estimation and budget comparison) → `mutate` (ladder-based alternative proposal) → `assessment` (status derivation and artifact emission) → gate. The artifact kinds are `guardrail-assessment` and (on resume) `guardrail-resolution`.

---

## Getting Started & Prerequisites

### Backstage Version

- Requires a Backstage backend running the `ai-core` plugin and its extension-point system (`agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint` from `@ai-crew-suite/plugin-kernel-node`)

### Agentic Requirements

| Capability | Module | State |
|---|---|---|
| LLM routing & model registry | `plugin-ai-core-backend-module-llm-openai` or `llm-openrouter` | Required for agent registration; model not currently invoked — reserved for future narrative generation |
| Compliance policy evaluation | `plugin-ai-core-backend-module-compliance` — `compliance.policy.evaluate` | Required; each configured policy is evaluated against the request parameters |
| Compliance architecture | `plugin-ai-core-backend-module-compliance` — `compliance.architecture.validate` | Required; architecture constraint validation contributes to the violation list |
| Compliance cost estimation | `plugin-ai-core-backend-module-compliance` — `compliance.cost.estimate` | Required for budget comparison; missing driver produces `undetermined` budget status |
| Compliance permissions | `plugin-ai-core-backend-module-compliance` — `compliance.permission.check` | Required for approval gate; checks approver authorization before releasing parameter sets |
| Runtime store + checkpoint | AI Core runtime store + `WorkflowContext.checkpointStore` | Required for negotiation checkpoint persistence across the approval gate |

---

## Installation & Setup

### Backend Setup

#### 1. Add the backend module dependency

In `packages/backend/package.json`:

```json
"dependencies": {
  "@ai-crew-suite/plugin-agent-scaffolder-guardrail-backend": "workspace:^"
}
```

#### 2. Wire the module into the backend

In `packages/backend/src/index.ts`:

```ts
import { scaffolderGuardrailModule } from '@ai-crew-suite/plugin-agent-scaffolder-guardrail-backend';

// Inside your backend builder:
backend.add(scaffolderGuardrailModule);
```

#### 3. Configure `app-config.yaml`

The module **throws at boot** if `ai.agents.scaffolderGuardrail.model` is missing or if no policies are configured:

```yaml
ai:
  agents:
    scaffolderGuardrail:
      model: scaffolder-guardrail
      policies:
        - id: instance-type-policy
        - id: region-policy
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
  "@ai-crew-suite/plugin-agent-scaffolder-guardrail": "workspace:^"
}
```

#### 2. Mount the page

In `packages/app/src/App.tsx`:

```ts
import scaffolderGuardrailExtensions from '@ai-crew-suite/plugin-agent-scaffolder-guardrail/alpha';

const app = createApp({
  features: [
    // ... existing features ...
    scaffolderGuardrailExtensions,
  ],
});
```

The page is available at `/scaffolder-ai-guardrail-agent`.

#### 3. Extend App test expectations

In `packages/app/src/App.test.tsx`, add the guardrail plugin ID (`scaffolder-ai-guardrail-agent`) to the expected plugin list.

---

## Configuration Reference

### Full `app-config.yaml` Schema

```yaml
ai:
  agents:
    scaffolderGuardrail:
      # Required
      model: scaffolder-guardrail
      policies:
        - id: instance-type-policy
        - id: region-policy

      # --- optional, with defaults ---

      maxParameterBytes: 16384       # Hard cap on parameter payload size
      maxToolInvocations: 12          # Hard cap on tool invocations per run
      maxNegotiationRounds: 3         # Maximum resubmission rounds (session memory)

      # Severity mapping — rule names to policy severity.
      # Any unlisted rule defaults to 'blocking' (fail-closed).
      severity:
        instance_type_restricted: negotiable
        region_restricted: blocking
        cost_threshold_exceeded: negotiable
        architecture_constraint: advisory

      # Budget thresholds
      budget:
        thresholdUsd: 1000           # Default monthly cost ceiling
        perEnvironment:
          production: 5000
          staging: 2000

      # Instance-type alternatives ladder (from most powerful to least)
      alternatives:
        instanceType:
          ladder:
            - db.m5.16xlarge
            - db.m5.8xlarge
            - db.m5.4xlarge
            - db.m5.xlarge
            - db.m5.large
          perEnvironment:
            test:
              - db.m5.large
              - db.t3.medium
```

### Policy Evaluation

Each policy in the `policies` array is evaluated via `compliance.policy.evaluate` with the policy ID and canonicalized request parameters. If the driver returns no violations but `passed` is false, a fallback `policy-denied` violation is generated. All violations are mapped to severities via the configurable `severity` table — **any unmatched rule defaults to `blocking`** (fail-closed).

Architecture validation runs via `compliance.architecture.validate` and its violations are merged into the violation list alongside policy violations.

### Budget & Cost

The `compliance.cost.estimate` tool is invoked with the request parameters. The returned amount is compared against `budget.thresholdUsd` (or the per-environment override). Results:
- `amount > thresholdUsd` → `over_budget`
- `amount <= thresholdUsd` → `within_budget`
- No estimate or missing amount → `undetermined`

### RBAC & Permissions

The guardrail agent has a real approval gate with authorization checks:
- **Manual evaluation** — any user with access to the `scaffolder-ai-guardrail-agent` plugin can submit a pre-flight evaluation
- **Approval gate** — when the assessment is `negotiable` or `escalate`, the graph emits a real `approval_request` and checkpoints the assessment. On resume, the approver's identity is verified via `compliance.permission.check` with action `guardrail.mutation.accept` or `guardrail.exception` depending on status
- **Unauthorized approvers** — rejected via `compliance.permission.check` with audit logging via `context.auditLogSink.recordWriteAction()`

---

## Designing & Authoring Workflows (Agent Core)

### Workflow Schema

The guardrail agent is registered with the following definition:

```ts
// agent.ts
{
  id: 'scaffolder-ai-guardrail-agent',
  modelRef: config.modelRef,
  workflowRef: 'scaffolder-guardrail',
  memory: 'session',
  systemPrompt: SCAFFOLDER_GUARDRAIL_SYSTEM_PROMPT,
  toolIds: [
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
    'compliance.cost.estimate',
    'compliance.permission.check',
  ],
  triggers: [
    { id: 'guardrail-preflight-on-demand', source: 'manual' },
  ],
}
```

### Context Provisioning

An evaluation is triggered by `POST agents/scaffolder-ai-guardrail-agent/runs`:

```ts
type GuardrailRequest = {
  version: 1;
  source: 'manual' | 'preflight';
  templateRef: string;              // Scaffolder template reference, e.g. 'template:default/database-service'
  parameters: Record<string, unknown>;  // The template's submitted parameters
  environment?: string;             // e.g. 'production', 'staging', 'test'
  requestedBy?: string;             // User identity
  sessionId?: string;               // For idempotent resubmission
};
```

Both `templateRef` and `parameters` are required. Parameters are canonicalized at intake: object keys are sorted, string values are lowercased and trimmed, and credential-shaped values (keys matching `token|password|secret|api_key|connection_string`) are redacted to `[REDACTED]`. The total parameter payload is capped at `maxParameterBytes` (default 16384).

### Graph Nodes

The graph runs a four-node assessment phase plus a checkpointed negotiation gate:

| Phase | Node | Source | Behaviour |
|---|---|---|---|
| **assess** | adjudicate | `adjudicate.ts` + `GuardrailGraph.ts` | Iterates each configured policy ID, invokes `compliance.policy.evaluate` for each, and invokes `compliance.architecture.validate` once. Folds all driver violations into a `PolicyViolation[]` with config-severity mapping and `pol-N`/`arch-N` evidence |
| **assess** | price | `price.ts` | Invokes `compliance.cost.estimate`, compares the result against `thresholdUsd` (or per-environment ceiling), and produces a `BudgetVerdict` with `cost-1` evidence |
| **assess** | mutate | `mutate.ts` | Scans violations for a `negotiable`-severity instance-type rule, looks up the current `instanceType` parameter in the configured instance-type ladder, and proposes the safest alternative at the bottom of the ladder |
| **assess** | assessment | `GuardrailGraph.ts` | Derives the `GuardrailAssessment.status` from violations, budget, and mutations (see status derivation table below). Emits the `guardrail-assessment` artifact |
| **gate** | approval_request | `GuardrailGraph.ts` | If status is `negotiable` or `escalate`, saves a `GuardrailCheckpoint` and emits a `real approval_request` SSE event with `effect: 'read'`. Non-negotiable statuses emit `done` immediately |

#### Assessment Status Derivation

| Condition | Status |
|---|---|
| Budget status is `undetermined` | `undetermined` |
| Any violation has `blocking` severity | `blocked` |
| Budget is `over_budget` AND no mutations proposed | `escalate` |
| No violations AND budget `within_budget` | `compliant` |
| Mutations proposed | `negotiable` |
| None of the above | `blocked` |

### The Negotiation Gate (resume)

This is the **first plugin in the series with a real approval gate**. The `GuardrailGraph.resume()` method:

1. Loads the `GuardrailCheckpoint` from `context.checkpointStore`
2. Invokes `compliance.permission.check` to verify the approver's identity:
   - `escalate` assessment → action `guardrail.exception`
   - `negotiable` assessment → action `guardrail.mutation.accept`
3. If permission is **denied**: records an audit log via `context.auditLogSink.recordWriteAction()` and returns an error
4. If permission is **granted**:
   - On `approved` with a mutation → applies the mutation to canonical parameters, emits `accepted_mutation` outcome
   - On `approved` without a mutation → emits `granted_exception` outcome with original parameters
   - On `rejected` → emits `halted` outcome
5. Emits the `GuardrailResolution` artifact with the outcome, approved parameters, accepted mutation IDs, and a parameter hash for idempotency

### Deterministic Engines

All three assessment engines are pure functions with no model dependency:

**`adjudicate()`** (pure): Maps every driver violation to a `PolicyViolation` with severity from the config table. Fail-closed: unmatched rules default to `blocking`. If a policy returns no violations but `passed === false`, generates a fallback `policy-denied` violation.

**`price()`** (pure): Compares `result.amount ?? result.range.high` against `thresholdUsd`. Returns `undetermined` when the cost estimate is unavailable or missing amount data — this cascades into the `undetermined` assessment status.

**`proposeMutation()`** (pure): Finds the first `negotiable`-severity violation whose parameter or rule references `instance`, looks up the current `instanceType` in the configured ladder, and selects the last (safest) entry as the alternative. Only proposes when: a matching violation exists, `instanceType` is a string, the ladder is non-empty, and the current value differs from the target.

### Parameter Fingerprinting

`fingerprintRequest()` computes an FNV-1a hash over a deterministic JSON payload: `{ templateRef, requestedBy, parameters }`. The hash enables idempotency detection — identical requests produce the same fingerprint — but the current implementation does not yet short-circuit on duplicate fingerprints (reserved for Milestone 3). The fingerprint is also used as the checkpoint key (`guardrail-<fingerprint>`) and re-computed for approved resolution parameters.

### Prompts & Tools Management

The system prompt enforces read-only, evidence-cited posture:

```
Use only the supplied deterministic policy verdicts, violations, costs, and alternatives.
Cite pol-N, arch-N, or cost-N evidence for every claim.
Never invent policies, parameter values, costs, or an exemption.
This is advisory-only and never executes a Scaffolder task.
```

**No LLM is currently invoked.** The `modelRef` and `systemPrompt` are reserved for a future step that will generate human-readable narrative summaries from the deterministic assessment data.

---

## User Guide & Interface Walkthrough

### Dashboard Overview

The frontend lives at `/scaffolder-ai-guardrail-agent` and provides:

1. **Evaluate a request** — `EvaluateRequestDialog` form accepting template reference and parameters
2. **ViolationList** — per-violation cards showing policy ID, rule, message, severity badge, and evidence citations
3. **CostPanel** — budget status badge, estimated amount vs ceiling, currency, and evidence citation
4. **MutationOfferPanel** — the proposed safe alternative for negotiable instance-type violations, showing the current value, proposed value, and rationale
5. **ApprovalBar** — approve/reject controls that render when a real `approval_request` event arrives
6. **ResolutionBanner** — shows the outcome (`accepted_mutation`, `granted_exception`, or `halted`) after the approval decision

Runs are deep-linked via `?run=<id>`.

### Human-in-the-Loop Actions

#### Evaluating a request

1. Navigate to `/scaffolder-ai-guardrail-agent`
2. Click **Evaluate a request**
3. Fill in:
   - **Template reference** — required, e.g. `template:default/database-service`
   - **Parameters** — required JSON object with the Scaffolder template's submitted parameters (e.g. `{"instanceType": "db.m5.16xlarge", "region": "us-east-1"}`)
   - **Environment** — optional, e.g. `production`
   - **Requested by** — optional user identity
4. Click **Evaluate**

The page streams live SSE events: each configured policy is evaluated, cost is estimated, mutations are derived, and the assessment renders with violations, cost panel, and mutation offers.

#### Understanding the assessment

- **`compliant`** — all policies passed, budget is within limits. The request can proceed without changes.
- **`negotiable`** — one or more violations exist but a safe alternative was proposed (e.g., an instance type can be downscaled). The approval bar appears — you can accept the mutation or reject.
- **`escalate`** — the request is over budget and no automatic mutation can resolve it. The approval bar appears — you can grant an exception or reject.
- **`blocked`** — a blocking-severity violation exists with no negotiable fallback. The request should not proceed without policy changes.
- **`undetermined`** — the cost estimate could not be produced. The request cannot be fully assessed.

#### Accepting or rejecting the negotiation

For `negotiable` and `escalate` assessments, the `ApprovalBar` renders with:
- **Approve (accept mutation)** — accepts the proposed parameter change. On `negotiable`, the instance type is replaced with the safe alternative and the resolution is `accepted_mutation`. On `escalate`, the original parameters are retained and the outcome is `granted_exception`.
- **Reject** — halts the request. The resolution outcome is `halted` and no parameter changes are released.

Both decisions are audited. The approver's identity is verified against the compliance permission driver before any action is taken — unauthorized approvers are refused with an error.

#### Replaying a past run

Append `?run=<id>` to the page URL. For checkpointed assessments, the page replays the assessment events up to the approval request. The approval bar renders if the run is still awaiting a decision.

---

## Troubleshooting & FAQs

### Turbo Workspace Resolution

**Symptom**: TypeScript errors on extension point types from `@ai-crew-suite/plugin-kernel-node`.

**Fix**: Ensure the dependency is listed as `"workspace:*"` and run `yarn install && yarn typecheck --force`.

### Agent Execution Failures

**"Scaffolder guardrail requires at least one configured policy" at boot**

The `policies` array must contain at least one `{ id: string }` entry. If empty, the module fails at boot. Add at minimum one policy ID to the config.

**Assessment always shows `blocked` for every violation**

The severity mapping defaults to `blocking` for any rule not explicitly listed in the `severity` config table. Add the violation's rule name to the `severity` config with a severity of `negotiable` or `advisory` to change the assessment outcome.

**Cost panel shows `undetermined` on every run**

The `compliance.cost.estimate` driver returned no estimate or the amount was missing. This cascades into an `undetermined` assessment status. Verify that the cost compliance module is configured and can produce estimates for your template parameters.

**Instance-type mutation never appears even with negotiable violations**

The `proposeMutation()` function requires:
- A `negotiable`-severity violation whose `parameter` or `rule` field contains the word `instance`
- The request parameters include an `instanceType` field with a string value
- The configured `alternatives.instanceType.ladder` is non-empty and contains the current `instanceType` value
- The current value differs from the target (last entry in the ladder)

For per-environment ladders, the function uses the global `ladder` — per-environment overrides are currently not consulted during mutation proposal.

**Approval gate error: "No pending guardrail negotiation checkpoint exists"**

The checkpoint was not saved, was evicted, or this run never reached the negotiation gate. Only `negotiable` and `escalate` assessments save checkpoints. `compliant`, `blocked`, and `undetermined` assessments terminate with `done`.

**Approval gate error: "Approver is not authorized"**

The `compliance.permission.check` driver rejected the approver's identity for the required action (`guardrail.mutation.accept` or `guardrail.exception`). The refusal is audited. Verify that the approver has the required permission in your compliance/permission backend.

### Frontend Issues

**Page loads but "Evaluate a request" does nothing**

Ensure `playwright/.auth/login.json` exists. The API client requires Backstage identity credentials.

**Approval bar never appears even for negotiable assessments**

The assessment must have status `negotiable` or `escalate` with a real `approval_request` SSE event. If you're replaying a past run via `?run=<id>`, the approval bar will render only if the run is still awaiting a decision.

---

## Roadmap

The following features are planned for future releases.

### AI-Powered Narrative Generation

The `modelRef` and `systemPrompt` fields are reserved for a future model call that will generate a human-readable narrative summary from the deterministic assessment — explaining in plain language why the request passed or failed, what each violation means, and the financial impact of the proposed alternative. All narrative must cite `pol-N`, `arch-N`, and `cost-N` evidence IDs.

### Per-Environment Mutation Ladders

The current `proposeMutation()` function uses the global `alternatives.instanceType.ladder`. Per-environment overrides in `alternatives.instanceType.perEnvironment` are configured and parsed but not consulted during mutation proposal. Extending the function to select the appropriate ladder based on `request.environment` will allow environment-specific safe alternatives.

### Idempotency via Fingerprint Short-Circuit

The `fingerprintRequest()` FNV-1a hash is computed for every request and included in the assessment. When combined with a runtime-store-backed session cache:

- Identical resubmissions (same templateRef, requestedBy, and parameters) will short-circuit and return the cached assessment without re-evaluating policies
- Changed parameters will produce a new fingerprint and trigger a fresh evaluation
- Zero additional tool or model invocations for duplicate requests
- TTL-based retirement of stale fingerprints

### Multi-Parameter Mutation Ladder

The current mutation engine only handles `instanceType`. Extending it to support additional parameter types (region, storage class, node count) with their own configurable ladders will enable broader automated safe-alternative proposals.

### Scaffolder Pre-Flight Integration

The plan calls for direct Scaffolder template pipeline integration — intercepting submissions before provisioning. This requires:
- A Backstage Scaffolder action or custom field extension that invokes the guardrail evaluation synchronously
- The negotiation gate integrated into the Scaffolder wizard UI for in-line approval
- The resolution's `approvedParameters` fed back into the Scaffolder execution context

### Scheduled Policy Audit Report

An optional background task that periodically evaluates all configured templates against current compliance policies and produces a policy health report — useful for detecting configuration drift in policy enforcement.

### Playwright E2E Test Suite

- `app-config.e2e.yaml` fixture backend with controlled compliance fixture data
- Playwright scenarios covering full happy-path (violation → cost → mutation → accept), reject path, blocked path, and replay recovery
- Screenshot-based review of violation list, cost panel, mutation offer, and resolution banner components
