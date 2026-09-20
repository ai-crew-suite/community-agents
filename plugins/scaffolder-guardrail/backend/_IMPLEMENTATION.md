# Scaffolder AI Guardrail Agent Implementation Plan

## Overview

This plugin sits directly inside your software template wizard pipelines, running active compliance validation steps before any cloud resource provisioning or repository scaffolding takes place.

- **The Task**: Intercepting and auditing inbound Backstage Scaffolder requests to enforce corporate architecture, security, and financial policies prior to infrastructure execution.
- **The Logic**: Rather than relying on rigid, hardcoded schema validation, an inbound Scaffolder request triggers a **Policy Guardrail Agent**. The agent reads the request parameters and cross-references them against an organization's central policy directives. If a request violates standard operating boundaries (e.g., attempting to provision an unapproved database cluster size or selecting a non-compliant cloud region), the graph branches into a **Human-in-the-Loop (HITL) Clarification State**. This pauses execution, retains the session checkpoint in PostgreSQL, and alerts the platform security or finance team to review, override, or provide feedback directly within the Backstage UI.
- **Framework**: **LangGraph / Stateful Orchestrator** using cyclic branching logic, centralized state persistence, and native HITL approval and escalation gates.
- **The Core Platform Win**: This is an exceptional use of your specialized runtime. This plugin single-handedly solves one of the biggest platform engineering problems: balancing developer velocity with enterprise governance. Traditional OPA (Open Policy Agent) gates fail here because they are binary (pass/fail). Your agent platform introduces a **negotiation layer** where the agent can say, _"You cannot spin up this heavy instance type for a testing environment, but if you click approve, I will automatically downscale it for you and proceed."_
- **Incorporate Cost Accounting Tools**: Because you built token and cost accounting controls into your core monorepo engine, pass those same metrics to the compliance judge. The agent can evaluate the financial impact of a Scaffolder request (e.g., estimating cloud spend based on the chosen instance type parameter) and conditionally route requests over a specific budget threshold through an explicit engineering leadership approval loop.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-guardrail-backend` as an AI Core backend module that intercepts inbound Backstage Scaffolder requests **before** any provisioning step fires and evaluates their parameters against corporate architecture, security, region, and financial policies. Unlike a binary OPA gate it opens a **negotiation layer**: when a request breaches a boundary it computes a deterministic, policy-derived *safe alternative* ("`db.m5.16xlarge` is not permitted in `test`; approve and I will downscale to `db.m5.large` at $120/mo"), suspends at a HITL clarification checkpoint, and resolves only with a parameter set an authorized human accepted. A paired frontend plugin renders violations, the cost estimate, and the accept/override panel.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **deterministic policy adjudication**, the **cyclic negotiation/mutation engine**, **fingerprint idempotency across resubmissions**, and the **Scaffolder pre-flight boundary**.

## Delivery Boundary

### In scope

- Evaluate one Scaffolder template request (template ref + parameter object) per run, via the generic `/agents/scaffolder-ai-guardrail-agent/runs` route.
- Deterministic `intake → adjudicate → price → negotiate → gate` graph. Verdicts, violations, and mutation values are pure code; the model writes only explanation copy.
- Bounded policy reads through registered read-only AI Core tools: `compliance.policy.evaluate`, `compliance.architecture.validate`, `compliance.cost.estimate`, `compliance.permission.check`.
- Optional RAG via `knowledge.retrieve` for policy-rationale prose in the explanation body only.
- A structured, citation-required `GuardrailAssessment` artifact, an `approval_request` event for negotiate/escalate outcomes, and a `GuardrailResolution` artifact recording the accepted parameter set.
- Fingerprint idempotency: identical non-compliant resubmissions return the existing unresolved negotiation session instead of burning a new evaluation.
- A minimal frontend: standalone review page, live SSE run view, violation list, cost panel, mutation-diff accept bar, resolution banner.

### Explicitly out of scope for v1

- **Executing the Scaffolder task.** The agent never dispatches a scaffolder task or provisions anything; it returns an assessment plus an approved parameter set. No Scaffolder execution contract is consumed until one is confirmed (see Scaffolder Integration Boundary).
- Authoring, editing, or publishing policy documents; the agent only reads verdicts from the compliance driver.
- Mutating catalog entities, cloud resources, or repositories. This plugin registers **no write tool at all**.
- Multi-template or batch governance review; one template request per run.
- Inventing a verdict when no compliance driver is configured — the run terminates as `undetermined` rather than silently passing.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `finops.service` / `scaffolder.service` `createServiceFactory` sketches and its bespoke `PENDING_REVIEWS` table assumption must not be implemented as written. Drive registered tool IDs through the workflow context and use AI Core persistence.

**Hard gate — the Scaffolder pre-flight interception point does not exist today.** There is no `createTemplateAction`, no `scaffolderActionsExtensionPoint` consumer, and no Scaffolder helper anywhere in this repo (`plugin-ai-core-node/src/scaffolder/` is unbuilt). v1 therefore ships as an **advisory** runner invoked by the frontend, not an enforcing interceptor.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Policy adjudication | `compliance.policy.evaluate` | **Exists**, `effect: read`; `ComplianceDriver.evaluatePolicy({ policyId, input })` returns `PolicyEvaluationResult` with `passed` + `violations: { rule, message, severity }[]` | Primary verdict source. One call per configured `policyId`; `passed: false` yields `PolicyViolation` records citing `rule`. |
| Architecture constraints | `compliance.architecture.validate` | **Exists**, `effect: read`; returns `ArchitectureValidationResult` (`valid`, `violations: { constraint, message }[]`) | Second verdict source for shape/topology rules (instance class, region, replica counts). |
| Financial evaluation | `compliance.cost.estimate` | **Exists**, `effect: read`; returns `CostEstimateResult` (`estimated`, `currency`, `amount`, `range`, `notes`) | Replaces the foundation doc's `finops.service`. `amount` (or `range.high`) is compared to `budget.thresholdUsd` to trigger the escalate branch. Absent driver → `undetermined` cost + limitation, never an implicit pass. |
| Approver authorization | `compliance.permission.check` | **Exists**, `effect: read`; returns `PermissionCheckResult` (`allowed`, `reason`) | Verify the *approver* may grant the specific exception/mutation class before `resume()` accepts a decision. |
| Policy rationale context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional; explanation prose only. Must never alter a verdict, violation, or mutation value. |
| HITL clarification gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** — approval types, `resume(runId, decision, context)`, `approval_request` event, checkpoint store, and `recordWriteAction` are all defined | Implement `GuardrailGraph.resume()`; checkpoint the frozen mutation set before the gate; audit decision, actor, template, and parameter hash. |
| Negotiation session persistence | AI Core runtime stores (runs/checkpoints/artifacts) | Exist | Track unresolved negotiations by fingerprint via runtime stores; do **not** hand-roll the foundation doc's `PENDING_REVIEWS` table. |
| **Scaffolder pre-flight hook** | A typed Scaffolder interception/extension point | **Not present** — no Scaffolder action, extension point, or core helper exists | Ship v1 advisory (frontend-invoked). Enforcement requires a narrowly typed pre-flight contract in `plugin-ai-core-node/src/scaffolder/`, shared with the other `scaffolder-*` agents. **Blocking for the enforcement milestone only.** |
| Optional policy reporting | `coreServices.scheduler` + `coreServices.discovery` + `coreServices.auth` | Available | Only for the optional periodic policy-posture report; the evaluation path itself is request-driven, not scheduled. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-guardrail-agent/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: re-exports module default + public types
    module.ts           # registers runner, agent, trigger, optional report task
    agent.ts            # SCAFFOLDER_GUARDRAIL_AGENT_ID, tool allow-list, system prompt
    config.ts           # readScaffolderGuardrailConfig (ai.agents.scaffolderGuardrail)
    workflow/
      index.ts          # barrel
      GuardrailGraph.ts         # WorkflowRunner id 'scaffolder-guardrail' (run + resume)
      state.ts                  # GuardrailState
      intake.ts                 # request validation + canonical parameter normalization
      fingerprint.ts            # pure: canonical hash (template + caller + parameters)
      adjudicate.ts             # pure: policy/architecture results -> PolicyViolation[]
      price.ts                  # cost estimate -> budget verdict (threshold compare)
      mutate.ts                 # pure: violation -> MutationProposal (safe alternative)
      assessment.ts             # GuardrailAssessment schema, validation, degradation
    scheduler/
      index.ts          # barrel
      policyReport.ts           # optional coreServices.scheduler posture report
      reportPlanner.ts          # pure: run history -> bounded report plan
    services/
      index.ts          # barrel
      PolicyCatalog.ts          # config policy set -> ordered evaluation plan
      NegotiationSessionStore.ts # fingerprint -> unresolved session via runtime stores
      GuardrailToolRunner.ts    # capped invokeTool facade (mirrors InvestigationToolRunner)
      GuardrailArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/assessment contracts
    __tests__/
    workflow/__tests__/
    scheduler/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-guardrail-agent'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler` (optional report only), `coreServices.discovery`, `coreServices.auth`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced.**
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-scaffolder-guardrail-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`, grouped with the other `@webstackbuilders` module loads.
- **Compliance module gate**: adjudication requires `plugin-ai-core-backend-module-compliance` plus a driver (`-opa`) to be loaded and configured. With no driver the module still boots, but every run terminates `undetermined` — this is a deliberate fail-closed posture, not a bug.
- **App config**: the module throws at boot without `ai.agents.scaffolderGuardrail.model`; add the config block (see Configuration) before enabling the load.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-scaffolder-guardrail": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'scaffolder-ai-guardrail-agent',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'scaffolder-guardrail'
  workflowRef: 'scaffolder-guardrail',
  memory: 'session',                  // a negotiation is a multi-turn session on one fingerprint
  systemPrompt: SCAFFOLDER_GUARDRAIL_SYSTEM_PROMPT,
  toolIds: [
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
    'compliance.cost.estimate',
    'compliance.permission.check',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'guardrail-preflight-on-demand', source: 'manual', agentId: 'scaffolder-ai-guardrail-agent' },
  ],
}
```

- **Every tool is `effect: 'read'`.** This agent has no write tool, so its `approval_request` is a *negotiation* gate (accept a mutation / grant an exception), not a write gate — the plugin must still refuse to emit a `resolved` status without a persisted decision.
- `memory: 'session'` (not `'none'`) is deliberate: the foundation doc's negotiation loop is cyclic, and a developer resubmitting a tweaked form must continue the same session rather than start cold.
- System prompt rules: the verdict, violation list, cost figure, and every mutation value are supplied **pre-computed** and must be quoted verbatim — never recomputed, softened, or overridden; cite `pol-N`/`arch-N`/`cost-N`/`kb-N` evidence IDs for every claim; never invent policy names, rules, instance types, or dollar amounts; write only the developer-facing explanation and the negotiation offer; if a violation is `severity: 'blocking'` with no safe alternative, state plainly that the request cannot proceed and do not suggest workarounds.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type GuardrailRequest = {
  version: 1;
  source: 'manual' | 'preflight';
  templateRef: string;           // required, 'template:default/rds-postgres'
  parameters: Record<string, unknown>;  // required, the inbound Scaffolder form values
  environment?: string;          // 'test' | 'staging' | 'prod'; sharpens policy selection
  requestedBy?: string;          // caller userRef; defaults to the run's identity
  sessionId?: string;            // continue an existing negotiation session
};
```

Validation requires `templateRef` and a non-empty `parameters` object, caps the serialized parameter size at `maxParameterBytes`, rejects unknown top-level fields, and redacts secret-shaped values before the object reaches any tool, prompt, artifact, or SSE frame.

## Guardrail Workflow

`GuardrailGraph` registers as `WorkflowRunner` id `scaffolder-guardrail` and implements **both** `run()` and `resume()`. It realizes the foundation doc's cyclic flow: **Inbound Request → Policy/Cost Evaluation → (compliant) Pass | (violation or over-budget) Negotiation & HITL Gate → Accept-Mutation | Reject-Halt**. Adjudication and mutation arithmetic are deterministic; the LLM only narrates.

### Deterministic graph nodes

1. **intake** — validate `GuardrailRequest`; `intake.ts` canonicalizes `parameters` (stable key order, trimmed strings, normalized numbers/units) so semantically identical submissions hash identically. `fingerprint.ts` then derives the idempotency key from `templateRef` + `requestedBy` + canonical parameters. `NegotiationSessionStore` is consulted **before any model or tool call**: an unresolved session for this fingerprint short-circuits the run and replays the existing assessment.
2. **adjudicate** — `PolicyCatalog` yields the ordered policy plan for the template/environment; `GuardrailToolRunner` invokes `compliance.policy.evaluate` per `policyId` and `compliance.architecture.validate` once. `adjudicate.ts` (pure, no LLM) folds `PolicyEvaluationResult.violations` and `ArchitectureValidationResult.violations` into a normalized `PolicyViolation[]` with stable `pol-N`/`arch-N` evidence IDs and a `severity` mapped through the config severity table. **No driver configured → terminal `undetermined`** (fail closed).
3. **price** — invoke `compliance.cost.estimate` with the proposal; `price.ts` (pure) compares `amount` (or the conservative `range.high`) against `budget.thresholdUsd` for the environment and yields a `BudgetVerdict`. `estimated: false` → `undetermined` cost recorded as a limitation, and the request is routed to escalate rather than passed.
4. **negotiate** — when violations or a budget breach exist, `mutate.ts` (pure) derives `MutationProposal[]` **only** from the config-declared safe alternatives (allow-lists and downscale ladders), never from model output: it picks the cheapest/nearest compliant value for each offending parameter, re-prices the mutated set via `compliance.cost.estimate`, and re-adjudicates it to prove the alternative is itself compliant. A violation with no declared alternative yields `severity: 'blocking'` and no offer. One model call then writes the explanation and the negotiation copy. Emits the `guardrail-assessment` artifact.
5. **gate** — for `negotiable` or `escalate` outcomes, emit `approval_request` carrying the violations, cost delta, and the frozen `MutationProposal[]`, checkpoint the state, and **suspend**. A fully `compliant` request skips the gate and finalizes as `pass`.
6. **resolve** *(resume path)* — `resume(runId, decision, context)`: verify the approver via `compliance.permission.check` for the specific exception class (an unauthorized approver is rejected and audited, **not** honored); on `approved` with an accepted mutation, re-validate the frozen proposal still adjudicates clean, emit a `guardrail-resolution` artifact carrying the approved parameter set plus audit record, and finish `resolved`; on `rejected`, record the decision and finish `halted` with no approved parameters.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'policy' | 'architecture' | 'cost' | 'knowledge'; summary: string; reference?: string };

type PolicyViolation = {
  id: string;                     // 'pol-1' | 'arch-1' ...
  policyId?: string;              // as supplied to compliance.policy.evaluate
  rule: string;                   // driver-reported rule/constraint identifier
  message: string;                // driver-reported message, never paraphrased numerically
  parameter?: string;             // offending parameter path, 'instanceType'
  severity: 'blocking' | 'negotiable' | 'advisory';
  evidence: string[];             // pol-N / arch-N
};

type BudgetVerdict = {
  status: 'within_budget' | 'over_budget' | 'undetermined';
  currency?: string;
  amount?: number;                // point estimate from CostEstimateResult
  ceiling?: number;               // range.high when the driver returns bounds
  thresholdUsd?: number;          // configured limit that was compared against
  evidence: string[];             // cost-N
};

type MutationProposal = {
  id: string;                     // 'mut-1' ...
  parameter: string;              // 'instanceType'
  from: unknown;                  // 'db.m5.16xlarge'
  to: unknown;                    // 'db.m5.large' — from the config allow-list only
  resolves: string[];             // PolicyViolation ids this mutation clears
  projectedAmount?: number;       // re-priced cost of the mutated set
  rationale: string;              // model copy; must cite pol-N / cost-N
};

// GuardrailState: { request, fingerprint, violations: PolicyViolation[],
//   budget?: BudgetVerdict, mutations: MutationProposal[], limitations: string[],
//   status: 'compliant'|'negotiable'|'escalate'|'blocked'|'undetermined'|'resolved'|'halted' }

type GuardrailAssessment = {
  templateRef: string;
  fingerprint: string;
  environment?: string;
  status: GuardrailState['status'];
  violations: PolicyViolation[];
  budget?: BudgetVerdict;
  mutations: MutationProposal[];
  confidence: 'high' | 'medium' | 'low';
  limitations: string[];
  evidence: EvidenceRef[];        // pol-N + arch-N + cost-N (+ kb-N) bundle
};

type GuardrailResolution = {
  templateRef: string;
  fingerprint: string;
  outcome: 'accepted_mutation' | 'granted_exception' | 'halted';
  approvedParameters?: Record<string, unknown>;  // canonical, post-mutation
  acceptedMutations: string[];    // mut-N ids
  assessmentRef: string;          // artifact ref of the GuardrailAssessment
  decidedBy: string;
  parameterHash: string;          // hash of approvedParameters, for downstream verification
};
```

Status mapping is fixed in code, not inferred: no violations and `within_budget` → `compliant`; only `negotiable` violations with at least one proven mutation → `negotiable`; `over_budget` with no violation → `escalate`; any `blocking` violation → `blocked` (no offer); missing driver or `undetermined` cost → `undetermined`. `confidence` is `low` whenever any limitation is present.

## Deterministic Policy Adjudication (New Structural Section)

The foundation doc's platform win depends on governance verdicts being trustworthy, so the model is structurally excluded from deciding them.

- `adjudicate.ts` and `price.ts` are pure modules with no AI Core, tool, or clock dependencies — they consume already-fetched driver results and return normalized verdicts, making every branch unit-testable against fixture payloads.
- Severity is assigned by a **config-declared table** keyed on `rule`/`constraint`, not by model judgment or driver free text. An unmapped rule defaults to `blocking` (fail closed), so a newly added policy cannot be silently negotiated away.
- `PolicyViolation.message` is carried through verbatim from the driver; the model's explanation lives in a separate field so a reviewer can always compare the two.
- Fail-closed everywhere: no driver → `undetermined`; unparseable driver payload → `undetermined` plus limitation; cost driver returning `estimated: false` → escalate, never pass. No code path reports an unevaluated request as compliant.
- `assessment.ts` re-validates the model narrative against the computed state and strips or flags any sentence asserting a verdict, number, or parameter value that does not match the deterministic record.

## Negotiation And Mutation Engine (New Structural Section)

This is the "negotiation layer" that distinguishes the plugin from a binary OPA gate.

- Safe alternatives come exclusively from **config-declared ladders and allow-lists** (an ordered `instanceType` ladder per environment, a permitted `region` set). `mutate.ts` selects the nearest compliant rung — never a model-invented value, and never a rung outside the declared set.
- Every proposal is **proved before it is offered**: the mutated parameter set is re-priced via `compliance.cost.estimate` and re-adjudicated through the same policy plan. A proposal failing either check is discarded rather than shown, so the UI can never offer a compromise that would itself be blocked.
- The loop is **bounded**: at most `maxNegotiationRounds` cycles per fingerprint, tracked on the session. Exhausting the rounds terminates as `blocked` with an explanation — the cycle guard the foundation doc's cyclic graph needs to avoid infinite haggling.
- Mutations are proposals, never silently applied: the accepted set becomes `approvedParameters` only inside a `GuardrailResolution` after `resume()`, and the caller is responsible for using it.
- `severity: 'blocking'` violations are structurally non-negotiable: `mutate.ts` never generates a proposal for them, and the gate offers no accept path — only an authorized-exception path subject to `compliance.permission.check`.

## Idempotency And Negotiation Sessions (New Structural Section)

The foundation doc requires rapid identical resubmissions to reuse the existing negotiation instead of spending tokens.

- `fingerprint.ts` is pure and canonical-first: stable key ordering, whitespace/case normalization on enum-like strings, and numeric normalization so `4` and `4.0` hash alike. The hash covers `templateRef` + `requestedBy` + canonical parameters — the foundation doc's "User ID + Template ID + Exact Parameters" signature.
- `NegotiationSessionStore` maps a fingerprint to its unresolved session using **AI Core runtime stores** (run + checkpoint + artifact records), not the foundation doc's hand-rolled `PENDING_REVIEWS` table.
- The lookup happens in **intake**, ahead of any tool or model call, so a duplicate submission costs one store read: the existing `guardrail-assessment` is replayed and the run finishes without a new evaluation or a duplicate `approval_request`.
- A session retires when it resolves (`resolved`/`halted`) or `sessionTtlHours` elapses; a *changed* parameter set produces a new fingerprint and legitimately starts a fresh negotiation while the prior session is superseded.

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` is a secondary path pulling the org's governance-handbook language into the explanation so a developer sees *why* a boundary exists. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; run/session state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** influence a verdict, severity, budget comparison, or mutation value. Tests assert the deterministic record is byte-identical with retrieval enabled and disabled.

## Background Scheduler Tasks (Optional Policy Report)

- The evaluation path is **request-driven**; the scheduler serves only an optional governance-posture digest, so `coreServices.scheduler` is a soft dependency.
- `scheduler/policyReport.ts` registers one task: `id: 'scaffolder-guardrail-policy-report'`, `frequency: { cron }` from config (default `0 7 * * 1`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- `reportPlanner.ts` (pure) aggregates recent run artifacts into counts by status, top violated rules, and negotiation-acceptance rate, capped at `maxReportRuns`. It emits a `guardrail-policy-report` artifact and **never** evaluates or mutates a request.
- Guardrails: mutex against overlap, bounded aggregation window, kill switch `report.enabled` (default **false**).

## Scaffolder Integration Boundary (New Structural Section)

The foundation doc positions this as a pre-flight interception module, but that hook does not exist in this repo yet. The boundary is stated explicitly so v1 does not fake enforcement.

- **v1 (advisory)**: the frontend calls the runner from the template form before submission and keeps its own submit control disabled until the assessment is `compliant` or `resolved`. This is real, useful governance, but it is **frontend-enforced** — a direct Scaffolder API call bypasses it, and that must be documented rather than glossed over.
- **v2 (enforcing)**: requires a narrowly typed pre-flight contract in `plugin-ai-core-node/src/scaffolder/` that a `scaffolder-backend` module can invoke and honor, shared with the other `scaffolder-*` agents. Only then can a non-compliant request be blocked server-side.
- Do **not** invent a `scaffolder.service` ref, and do not let the agent execute a task. `GuardrailResolution.parameterHash` exists precisely so a future enforcing caller can verify the parameters it is about to execute are the ones a human approved.
- Until v2 lands, every `GuardrailAssessment` carries the limitation `advisory-only: not enforced server-side`, so no consumer mistakes the assessment for a hard gate.

## Configuration

```yaml
ai:
  agents:
    scaffolderGuardrail:
      model: scaffolder-guardrail   # installation-registered model ID, required
      maxParameterBytes: 16384      # optional, default 16384 inbound parameter cap
      maxToolInvocations: 12        # optional, default 12
      maxNegotiationRounds: 3       # optional, default 3 cycle guard
      sessionTtlHours: 24           # optional, default 24 unresolved-session lifetime
      policies:                     # evaluated in order via compliance.policy.evaluate
        - id: corp-architecture
        - id: corp-security
        - id: corp-region
      severity:                     # rule/constraint -> severity; unmapped defaults to blocking
        instance-type-not-approved: negotiable
        region-not-approved: negotiable
        public-ingress-forbidden: blocking
        missing-owner-tag: advisory
      budget:
        thresholdUsd: 1000          # optional, default 1000; over this routes to escalate
        perEnvironment:             # optional per-environment overrides
          test: 250
          prod: 5000
      alternatives:                 # the ONLY source of mutation values
        instanceType:
          ladder: ['db.m5.16xlarge', 'db.m5.4xlarge', 'db.m5.xlarge', 'db.m5.large']
          perEnvironment:
            test: ['db.m5.large']
        region:
          allow: ['us-east-1', 'us-west-2', 'eu-west-1']
      report:
        enabled: false              # optional, default false
        cron: '0 7 * * 1'           # optional, default Monday 07:00
        maxReportRuns: 200          # optional, default 200
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Validate at boot that every `alternatives` ladder value is a string/number literal and that `policies` is non-empty — an empty policy set would make every request trivially compliant, so it is a startup error.

## Shared AI-Core Work To Build First

- **Scaffolder pre-flight contract (blocking for enforcement only)** — a narrowly typed pre-flight interface in `plugin-ai-core-node/src/scaffolder/`, shared with `scaffolder-ai-intent`, `-prd`, `-infra`, and `-drift-detector`. v1 does not need it; do not build a bespoke one here.
- **Compliance driver coverage** — `compliance.*` tools exist, but the OPA driver must actually implement `evaluatePolicy`/`validateArchitecture`/`estimateCost` for the configured policies. Confirm the driver returns normalized `violations` arrays; a driver returning only `passed` degrades severity mapping to `blocking` for everything.
- **No new adjudication, approval, or persistence machinery in core** — `adjudicate.ts`/`price.ts`/`mutate.ts`/`fingerprint.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, and runtime stores all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-guardrail-agent/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # GuardrailRequest/Assessment/Resolution wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # scaffolderGuardrailApiRef
      client.ts                   # ScaffolderGuardrailClient: evaluateRequest(), streamRunEvents(), submitApproval(), listAssessments()
    hooks/
      index.ts                    # barrel
      useGuardrailRun.ts          # pure reducer + hook (evaluate/accept/override/reject/reset)
      useAssessmentList.ts        # recent assessments for the review page
    components/
      index.ts                    # barrel
      GuardrailReviewPage.tsx     # standalone: assessment list + on-demand evaluation
      AssessmentTable.tsx         # template, status, violation count, cost, deep links
      EvaluateRequestDialog.tsx   # templateRef/parameters/environment inputs
      GuardrailRunView.tsx        # live node/tool progress from SSE
      ViolationList.tsx           # per-violation rule/message/severity + pol-N citations
      CostPanel.tsx               # BudgetVerdict: estimate vs threshold, cost-N citations
      MutationOfferPanel.tsx      # from -> to parameter diff + re-priced amount
      ApprovalBar.tsx             # accept mutation / request exception / reject
      ResolutionBanner.tsx        # approved parameter set + advisory-only notice
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'scaffolder-ai-guardrail-agent'`; package `@ai-crew-suite/plugin-agent-scaffolder-guardrail`.
- Primary surface is a **standalone review page** (nav item) via `PageBlueprint`, listing assessments and their negotiation state. No `EntityCardBlueprint` extension — the subject is a template request, not a catalog entity.
- `evaluateRequest()` POSTs `/agents/scaffolder-ai-guardrail-agent/runs` with the JSON `GuardrailRequest`; the assessment renders from the `guardrail-assessment` artifact; `ResolutionBanner` renders `guardrail-resolution`.
- **Negotiation UX** is the distinguishing surface: `MutationOfferPanel` shows each offer as an explicit `from → to` parameter diff with its re-priced amount, and `ApprovalBar` offers *accept the mutation* (for `negotiable`) or *request an exception* (for `escalate`) — the two paths are visually distinct because they carry different authorization requirements.
- `blocked` renders with the accept path **absent**, not merely disabled, so a blocking violation cannot be misread as negotiable. `undetermined` renders as an explicit "governance could not be evaluated" state, never as a pass.
- The advisory-only limitation is rendered persistently until the v2 enforcement contract lands, so no one mistakes the page for a server-side gate.
- Preserve `sessionId` across resubmissions on the same template so a tweaked form continues the same negotiation and the fingerprint short-circuit is observable in the UI.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `fingerprint.ts` canonicalization — key reordering, `4` vs `4.0`, and whitespace/case variants all collide, while a changed value does not. `adjudicate.ts` severity mapping including the unmapped-rule → `blocking` fail-closed default. `price.ts` threshold comparison with `amount`, with `range.high` only, and with `estimated: false`. `mutate.ts` ladder selection (nearest compliant rung, environment override, no declared alternative → no proposal, blocking → no proposal). `reportPlanner.ts` caps.
- **Workflow (runtime) tests**: drive `GuardrailGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `finops.service` `createServiceFactory` sketch. Headline scenario (the foundation doc's own test): `compliance.cost.estimate` returns `{ estimated: true, amount: 4500 }` for `instanceType: 'db.m5.16xlarge'` against `budget.thresholdUsd: 1000`; assert the run flags the overshoot, **suspends** at `approval_request`, and the assessment carries a `MutationProposal` of `db.m5.16xlarge → db.m5.large` re-priced at `120`.
- **Negotiation-gate hardening** (foundation doc §2 posture): assert the run stays suspended and no `resolved` status is emitted when the model hallucinates a tool call or tries to skip the gate; `resume('approved')` with an accepted mutation produces `approvedParameters` matching the mutated set exactly once; `resume('rejected')` yields `halted` with no approved parameters; an approver failing `compliance.permission.check` is **refused and audited**, not honored.
- **Idempotency tests** (the foundation doc's explicit requirement): fire identical non-compliant parameters in rapid succession; assert the second run replays the existing session artifact, performs **zero** additional tool/model invocations, and does not emit a duplicate `approval_request`. Then submit a *changed* parameter set and assert a genuinely new fingerprint and session.
- **Cycle-guard tests**: a request whose every ladder rung still violates policy exhausts `maxNegotiationRounds` and terminates `blocked` — never loops.
- **Fail-closed tests**: no compliance driver → `undetermined` (never `compliant`); `estimated: false` → escalate; a driver returning `passed: false` with no `violations` array still maps to `blocking` severity rather than a silent pass.
- **`knowledge.retrieve` isolation**: pre-baked governance-handbook chunks selected by query substring; assert violations, severities, budget verdict, and mutation values are byte-identical with retrieval enabled and disabled.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` (carrying the budget/ladder config) + `mockServices.database`, asserting boot registration, run→SSE event order, checkpoint persistence at the gate, resume flow, and assessment/resolution artifact persistence.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards the report tick; assert bounded aggregation, `report.enabled: false` respected, overlap skipped, and that the report **never** evaluates or mutates a request.
- **E2E**: extend the shared fixture profile with a fixture compliance driver returning scripted violations/costs. Playwright: open the review page → evaluate an over-budget fixture request → see violations, cost panel, and the downscale offer → accept → assert the resolution banner shows the mutated parameters; plus a reject path and a `blocked` path proving the accept control is absent. Add `yarn test:e2e:scaffolder-ai-guardrail-agent`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Guardrail-specific additions:

- **Fail closed, always.** An unevaluated, undetermined, or error state is never reported as compliant. Absence of a compliance driver reduces functionality; it never widens permission.
- **The model cannot grant an exemption.** Verdicts, severities, budget comparisons, and mutation values are deterministic; the model's only outputs are prose fields that `assessment.ts` validates against the computed record.
- **Approver authorization is checked server-side** via `compliance.permission.check` on resume, scoped to the specific exception/mutation class — a developer must not be able to approve their own over-budget request unless policy permits it. The decision, `decidedBy`, template, fingerprint, and `parameterHash` are audit-logged; rejections and refused approvals are audited too.
- Inbound `parameters` are **untrusted input**: cap serialized size, reject unknown top-level fields, redact secret-shaped values (tokens, passwords, connection strings) before they reach any tool, prompt, artifact, SSE frame, or audit record, and delimit them in the prompt with an instruction not to follow content found inside them.
- Cost figures come only from `compliance.cost.estimate`; never fabricate or extrapolate a dollar amount. An absent estimate is `undetermined`, not zero.
- The advisory-only enforcement boundary is surfaced on every assessment until the v2 Scaffolder contract lands, so operators do not over-trust the gate.
- Negotiation sessions may contain business-sensitive parameters — retain them only for `sessionTtlHours` and never persist them into vector storage.
## Ordered Implementation Milestones

### Milestone 0: Shared contracts and pure engines

- [ ] Confirm the `compliance.*` tool IDs and that the configured driver returns normalized `violations` arrays; confirm `knowledge.retrieve`.
- [ ] Define `GuardrailRequest`, `PolicyViolation`, `BudgetVerdict`, `MutationProposal`, `GuardrailAssessment`, `GuardrailResolution`, and the config schema (policies, severity table, budget, alternatives ladders).
- [ ] Implement + unit-test `intake.ts`, `fingerprint.ts`, `adjudicate.ts`, `price.ts`, `mutate.ts`, `reportPlanner.ts`.

Exit criteria: canonical hashing, severity mapping (incl. fail-closed default), budget comparison, and ladder selection are provably deterministic on fixtures; schemas validate fixture payloads.

### Milestone 1: Assessment backend (read-only, advisory)

- [ ] Scaffold package with barrel `index.ts` in every directory, register runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement intake → adjudicate → price → negotiate → `guardrail-assessment` artifact (no gate yet).
- [ ] Wire into `packages/backend` and add the `ai.agents.scaffolderGuardrail` config block.
- [ ] Add unit, workflow-scenario (mock router), and backend integration tests, including the fail-closed matrix.

Exit criteria: the foundation doc's over-budget scenario yields violations, a cost verdict, and a proven downscale offer deterministically, with no real LLM or compliance provider.

### Milestone 2: HITL negotiation gate

- [ ] Implement the gate + `GuardrailGraph.resume()`: checkpointed frozen mutations, `approval_request`, approver check via `compliance.permission.check`, accept → `guardrail-resolution` + audit, reject → `halted`, plus the `maxNegotiationRounds` cycle guard.
- [ ] Gate-hardening tests: hallucinated tool call, node-skip attempt, unauthorized approver refusal, no duplicate resolution.

Exit criteria: `resolved` is provably unreachable without a persisted, authorized decision; the negotiation loop provably terminates.

### Milestone 3: Idempotency and sessions

- [ ] Implement `NegotiationSessionStore` over the runtime stores and the intake short-circuit; add TTL retirement and supersede-on-change.
- [ ] Idempotency tests proving zero extra tool/model calls on identical resubmission and a fresh session on changed parameters.

Exit criteria: rapid identical resubmissions consume no additional model budget and never duplicate an approval request.

### Milestone 4: Frontend and E2E

- [ ] Implement the frontend (`ApiBlueprint` + `PageBlueprint`, review page, evaluate dialog, SSE run view, violation list, cost panel, mutation offer, approval bar, resolution banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, compliant/negotiable/escalate/blocked/undetermined, approval request, accept/exception/reject, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright accept, reject, and blocked scenarios with screenshot review.

Exit criteria: `yarn test:e2e:scaffolder-ai-guardrail-agent` demonstrates violation → cost → downscale offer → accept, plus reject and blocked paths, in a browser without external infrastructure.

### Milestone 5: Optional report and production readiness

- [ ] Implement the optional `policyReport` task with mutex and kill switch, plus fast-forwarded scheduler tests.
- [ ] Document model registration, compliance/OPA driver configuration, policy and ladder authoring, approver permissions, and the advisory-vs-enforcing boundary.
- [ ] Dashboards/alerts for assessment volume by status, top violated rules, negotiation-acceptance rate, undetermined rate, and model cost.
- [ ] Opt-in real-model evaluation suite (grounding: every claim cites supplied evidence IDs; no fabricated policies, rules, instance types, or dollar amounts; quoted numbers match the deterministic record) within budget.

Exit criteria: staged rollout with the report disabled by default, bounded costs, verified approval auditing, and the enforcement limitation documented.

## Definition of Done

- Package, agent, runner (`run` + `resume`), manual trigger, config schema, and the read-only compliance allow-list implemented and registered (root + app/backend wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, a checkpoint at the negotiation gate, token/cost usage, and `guardrail-assessment` / `guardrail-resolution` artifacts.
- Verdicts, severities, budget comparisons, and mutation values are pure, deterministic, config-bounded code — never model output — and every offered mutation is proven compliant and re-priced before it is shown.
- The plugin registers **no write tool**, never executes a Scaffolder task, and `resolved` requires a persisted decision from an approver that passed `compliance.permission.check`.
- Identical resubmissions provably reuse the existing negotiation session with zero additional model spend; the negotiation loop provably terminates within `maxNegotiationRounds`.
- Frontend renders violations, cost, and offers over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies accept, reject, and blocked paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, raw parameter values that should be redacted, uncited numbers, fabricated costs, or a `compliant`/`resolved` status lacking a deterministic basis.

## Backend Completed

### Implemented

- Package, config schema, AI Core module, session-memory agent, manual trigger,
  root/backend wiring, and required `scaffolderGuardrail` configuration.
- Custom `scaffolder-guardrail` workflow with bounded intake, parameter
  canonicalization/redaction, pure fingerprinting, policy/architecture
  adjudication, cost classification, config-bounded mutation selection, and
  replayable `guardrail-assessment` artifacts.
- Fail-closed outcomes: unavailable policy/architecture evaluation or an
  unestimated cost yields `undetermined`, never `compliant`; unmapped rules are
  `blocking`.
- Checkpointed `approval_request` for negotiable/escalate outcomes; `resume()`
  validates the approver through `compliance.permission.check`, records audit
  events, and emits `guardrail-resolution` with the exact approved parameters.
- No Scaffolder execution, write tool, cloud/repository/catalog mutation, or
  model-derived policy/cost/mutation decision.

### Advisory boundary

The verified Scaffolder pre-flight interception point is absent. This v1 module
is therefore advisory and every assessment records
`advisory-only: not enforced server-side`; direct Scaffolder API calls can bypass
it until a shared pre-flight contract lands. No fictional Scaffolder service or
interception hook was introduced.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Deferred

Runtime-store fingerprint session reuse/TTL, re-pricing/re-adjudicating the
mutation before an offer, optional policy reporting, the frontend/E2E package,
and server-side Scaffolder enforcement remain future milestones. They require
additional confirmed runtime-store query and/or Scaffolder contracts and were not
fabricated here.

## Frontend Completed

Implemented the contract-matched advisory frontend at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-guardrail-agent`

### Implemented surface

- Package `@ai-crew-suite/plugin-agent-scaffolder-guardrail`
  with legacy and `./alpha` entrypoints; standalone page at
  `/scaffolder-ai-guardrail-agent` with `?run=<id>` replay.
- Typed API client for request evaluation, SSE replay with `Last-Event-ID`, and
  approval submission.
- Pure `useGuardrailRun` reducer/hook for `guardrail-assessment`,
  `guardrail-resolution`, progress, approval, and malformed-artifact handling.
- Bounded template request dialog (template reference, environment, JSON
  parameters), violation citations, budget panel, mutation diff offers,
  status/limitations, real negotiation approval UI, and resolution banner.
- Blocking assessments structurally render no acceptance path; escalation shows
  an exception request; every resolution keeps the advisory-only warning.

### Contract limitation (not fabricated)

There is no assessment-list endpoint and no server-side Scaffolder pre-flight
interception hook. The frontend intentionally does not invent a dashboard list
API or claim that a direct Scaffolder API submission has been gated; it renders
the backend's persistent `advisory-only: not enforced server-side` limitation.

