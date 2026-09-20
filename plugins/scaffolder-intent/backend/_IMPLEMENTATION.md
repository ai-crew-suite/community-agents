# Scaffolder AI Intent Implementation Plan

## Overview

This plugin analyzes natural language intent inputs from users to automatically select, pre-fill, and execute appropriate software template blueprints.

**Value**: High. Standard Scaffolder forms can suffer from field fatigue, often requiring complex regex validations and deep knowledge of enterprise parameter syntax.

**Optimization Strategy**: Shift this from a basic form-filler into a **Self-Healing Parameter Validator**. Instead of just guessing strings, your LangGraph orchestrator should parse the natural language, match it to the Scaffolder schema, and use your platform's **idempotency and validation loops** to test the inputs against live infrastructure rules (e.g., verifying if a requested service name is already taken in the Backstage Catalog) before prompting the user with a confirmation screen.

- **The Task:** Replacing manual Scaffolder forms with natural-language service requests.
- **The Logic:** A dev describes their needs in plain English. The agent selects the correct Software Template and pre-fills the parameters.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-intent-backend` as an AI Core backend module that turns a plain-English provisioning request ("create a react app called payment-gateway") into a **validated** Scaffolder template selection with pre-filled parameters. It is not a form-filler: parameters are coerced against the template's real JSON schema, then tested against live infrastructure rules — chiefly catalog name availability — and any failure loops back through a **self-healing correction turn** that asks the developer for a specific fix. The graph then freezes at a human confirmation gate and triggers the Scaffolder task only after an explicit confirmation. A paired frontend plugin owns the conversational correction form and the confirmation screen.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: **schema-grounded parameter coercion**, the **self-healing validation loop**, **multi-turn session state**, and the **confirmation-gated task trigger**.

## Delivery Boundary

### In scope

- One natural-language provisioning request per session, via the generic `/agents/scaffolder-ai-intent/runs` route, continued across correction turns by `sessionId`.
- Deterministic `parse → select → coerce → validate → correct → gate → trigger` graph. Template ranking inputs, schema coercion, validation verdicts, and the trigger decision are pure code; the model proposes candidate values and correction questions only.
- Bounded reads: allowed template schemas via the real `scaffolderServiceRef.getTemplateParameterSchema`, catalog availability via a `catalogServiceRef` adapter, optional repo-name validity via `vcs.repository.get_metadata`.
- A **self-healing loop**: a failed live check (name collision, schema violation, policy rejection) appends a structured `ValidationIssue` and returns a targeted correction question instead of proceeding.
- A `template-intent-proposal` artifact, an `approval_request` at the confirmation gate, and a `template-intent-execution` artifact recording the spawned task.
- Task creation through the **real** `scaffolderServiceRef.scaffold()`, gated on explicit confirmation and default-disabled by config.
- A minimal frontend: intent entry, live SSE run view, proposal review, conversational correction form, confirmation gate, task banner.

### Explicitly out of scope for v1

- **Autonomous task execution.** No task is created without a persisted human confirmation; `execute.enabled` defaults to `false`, in which case the run terminates at the proposal.
- Authoring, editing, or publishing templates; the agent only reads registered template schemas.
- Free-form provisioning outside the configured template allow-list — an unmatched intent returns candidates or `no_template_match`, never an invented template ref.
- Mutating the catalog, repositories, or cloud resources directly; the only write is the Scaffolder task spawn, and the task itself does the provisioning.
- Monitoring, retrying, or cancelling a spawned task beyond recording its ID (`getTask`/`cancelTask`/`retry` are out of scope for v1 even though the service exposes them).
- Multi-template or batch requests; one template + one parameter set per session.

## Required Prerequisites

Contracts verified against the current codebase and the installed Backstage SDK. As with the catalog plan: no fictional service refs — the foundation doc's `scaffolder.service` `createServiceRef` sketch (with its invented `getTemplateSchema` / `executeTemplateJob`) must **not** be implemented as written.

**Verified, and decisive for this plugin:** a real, typed Scaffolder backend service already exists. `@backstage/plugin-scaffolder-node@0.13.5` is installed (already a dependency of `plugin-ai-core-backend-module-vcs`) and exports `scaffolderServiceRef` — confirmed at runtime as `{ id: 'scaffolder-client', scope: 'plugin' }` — whose `ScaffolderService` interface provides `getTemplateParameterSchema({ templateRef }, { credentials })`, `scaffold(ScaffolderScaffoldOptions, { credentials })`, `dryRun(...)`, `getTask`, `listTasks`, and `autocomplete`. Both capabilities Luna flagged as "confirm first" are therefore **available now**, credential-scoped, with no bespoke abstraction required.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Template schema discovery | `scaffolderServiceRef` → `getTemplateParameterSchema({ templateRef }, { credentials })` returning `TemplateParameterSchema` | **Exists** (installed v0.13.5, `id: 'scaffolder-client'`) | Replaces the foundation doc's invented `getTemplateSchema`. Fetch schemas only for config-allow-listed template refs; cache per run. |
| Task creation (the only write) | `scaffolderServiceRef` → `scaffold(ScaffolderScaffoldOptions, { credentials })` returning `ScaffolderScaffoldResponse` | **Exists** | Replaces the invented `executeTemplateJob`. Called **only** from the post-confirmation resume path, using the confirming user's credentials. |
| Pre-flight task validation | `scaffolderServiceRef` → `dryRun(ScaffolderDryRunOptions, ...)` | **Exists** | Optional extra validation layer before the gate; degrade silently when it fails for reasons unrelated to parameters. |
| Catalog name availability | `catalogServiceRef` adapter → `getEntityByRef` / `getEntities` | Pattern **exists** — `CatalogContextResolver` in catalog-ai-insights defines a narrow `CatalogClientLike` (`getEntityByRef`, `getEntities` with `filter`/`limit`) and a `CatalogTokenProvider` | Reuse that adapter shape for the collision check that drives the self-healing loop (the foundation doc's `payment-gateway` case). |
| Repo/target name validity | `vcs.repository.get_metadata` | Exists, `effect: read` | Optional: confirm the destination repo name is structurally valid/available; absent driver becomes a limitation, not a failure. |
| Policy constraints on parameters | `compliance.policy.evaluate`, `compliance.architecture.validate` | Exist, `effect: read` | Optional second validation layer; overlaps `scaffolder-ai-guardrail-agent`, so keep it advisory here and defer hard governance to that plugin. |
| Template selection guidance | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional; ranking *evidence* and human-readable guidance only. It must never select the template or set a parameter value. |
| Multi-turn session state | AI Core session memory + runtime stores (runs/checkpoints/artifacts) | Exist | Carry conversation context and issue history across correction turns; do **not** hand-roll the foundation doc's bespoke conversation table. |
| Confirmation gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `IntentGraph.resume()`; checkpoint the frozen parameter set before the gate; audit the confirmation, actor, template ref, and parameter hash. |
| Scheduler | — | Available but **unused** | Intent resolution is strictly interactive; there is no background path and therefore no scheduler section in this plan. |

## Package Shape

Backend module from the same template as `catalog-ai-insights`; only the domain directories differ. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-intent/
  package.json          # role: backend-plugin-module, pluginId: ai-core
                        # deps incl. @backstage/plugin-scaffolder-node
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, trigger
    agent.ts            # SCAFFOLDER_INTENT_AGENT_ID, tool allow-list, system prompt
    config.ts           # readScaffolderIntentConfig (ai.agents.scaffolderIntent)
    workflow/
      index.ts          # barrel
      IntentGraph.ts            # WorkflowRunner id 'scaffolder-intent' (run + resume)
      state.ts                  # IntentState (request, candidates, params, issues, turns)
      parse.ts                  # pure: utterance -> normalized IntentFacts
      select.ts                 # pure: IntentFacts + schemas -> ranked TemplateCandidate[]
      coerce.ts                 # pure: facts -> typed params against TemplateParameterSchema
      validate.ts               # live checks -> ValidationIssue[] (collision, schema, policy)
      correct.ts                # pure: issues -> targeted correction questions
      proposal.ts               # ScaffolderIntentProposal schema, validation, degradation
      trigger.ts                # confirmation-gated scaffolderService.scaffold() call
    services/
      index.ts          # barrel
      TemplateResolver.ts       # scaffolderServiceRef adapter: allow-listed schema fetch + cache
      NameAvailabilityChecker.ts # catalogServiceRef adapter: entity-ref collision probe
      IntentSessionStore.ts     # multi-turn session + idempotency via runtime stores
      IntentToolRunner.ts       # capped invokeTool facade (mirrors InvestigationToolRunner)
      IntentArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/proposal contracts
    __tests__/
    workflow/__tests__/
    services/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-intent'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, and `scaffolderServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced**; `coreServices.scheduler` is intentionally unused.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-scaffolder-intent-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`, grouped with the other `@webstackbuilders` module loads.
- **Scaffolder dependency**: add `@backstage/plugin-scaffolder-node` to this package's `dependencies` for `scaffolderServiceRef`. The module must load **after** `@backstage/plugin-scaffolder-backend` so the service is registered; `scaffolderServiceRef` is `scope: 'plugin'`, so it resolves through normal service injection with no extension point needed.
- **App config**: the module throws at boot without `ai.agents.scaffolderIntent.model` and a non-empty `templates.allowed`; add the config block (see Configuration) before enabling the load. Task creation additionally requires `execute.enabled: true`.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-scaffolder-intent": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'scaffolder-ai-intent',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'scaffolder-intent'
  workflowRef: 'scaffolder-intent',
  memory: 'session',                  // correction turns continue one conversation
  systemPrompt: SCAFFOLDER_INTENT_SYSTEM_PROMPT,
  toolIds: [
    'vcs.repository.get_metadata',
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'intent-request-on-demand', source: 'manual', agentId: 'scaffolder-ai-intent' },
  ],
}
```

- **Every registered tool is `effect: 'read'`.** Template schema reads and the task spawn go through the injected `scaffolderServiceRef` (a typed backend service, not a tool), so the write is not model-reachable: no tool call can create a task.
- `memory: 'session'` is essential, not incidental — the foundation doc's self-healing loop is a conversation, and a corrected name must land in the same session rather than a cold run.
- System prompt rules: propose values **only** for fields declared in the supplied `TemplateParameterSchema`, never invent fields, template refs, or owners; the selected template and every validation verdict are supplied pre-computed and must be quoted verbatim; when a `ValidationIssue` is present, ask exactly one specific corrective question naming the offending field and the reason; never claim a task was created; cite `tpl-N`/`cat-N`/`kb-N` evidence IDs for every factual claim.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload:

```ts
type IntentRequest = {
  version: 1;
  source: 'manual';
  utterance: string;             // required, 'create a react app called payment-gateway'
  sessionId?: string;            // continue an existing correction conversation
  corrections?: Record<string, unknown>;  // user-supplied field fixes from a prior turn
  templateHint?: string;         // optional allow-listed template ref to force selection
  owner?: string;                // optional owner override; else derived from identity
};
```

Validation requires a non-empty `utterance` capped at `maxUtteranceChars`, rejects a `templateHint` outside `templates.allowed`, restricts `corrections` keys to fields present in the selected template's schema, and treats all free text as untrusted prompt input.

## Intent Workflow

`IntentGraph` registers as `WorkflowRunner` id `scaffolder-intent` and implements **both** `run()` and `resume()`. It realizes the foundation doc's transactional graph: **Parse Natural Language → Select Template Match → Self-Healing Validation Loop → Human Confirmation Gate → Trigger Scaffolder Job**, with the validation loop cycling back on a failed live check. Selection inputs, coercion, and verdicts are deterministic; the model proposes and explains.

### Deterministic graph nodes

1. **parse** — validate `IntentRequest`; one model call extracts structured `IntentFacts` (intended kind, proposed name, language/framework hints, owner hints), which `parse.ts` normalizes and constrains to a fixed fact schema. An utterance yielding no actionable facts terminates as `unparseable` with a clarifying question — no template is guessed.
2. **select** — `TemplateResolver` fetches `TemplateParameterSchema` for each **allow-listed** template ref via `scaffolderServiceRef.getTemplateParameterSchema` (cached per run), then `select.ts` (pure) ranks candidates by deterministic feature overlap between `IntentFacts` and each schema's fields/title/tags. Ties, or an empty ranking above `minSelectionScore`, return `TemplateCandidate[]` for the user to pick — `no_template_match`, never an invention. `knowledge.retrieve` may contribute ranking *evidence* but cannot alter the ordering rule.
3. **coerce** — `coerce.ts` (pure) maps `IntentFacts` plus any `corrections` into typed parameters **against the real schema**: type coercion, enum snapping, pattern/format checks, required-field detection, and default application. Unmapped required fields become `missing_field` issues rather than fabricated values. This is the strict-schema compliance the foundation doc demands.
4. **validate** — live infrastructure checks producing `ValidationIssue[]`: (a) **name availability** via `NameAvailabilityChecker` probing the catalog for the would-be entity ref — the foundation doc's `payment-gateway` collision; (b) **schema residue** from coerce; (c) optional repo-name validity via `vcs.repository.get_metadata`; (d) optional advisory policy checks. Optionally `scaffolderService.dryRun` as a final pre-flight.
5. **correct** *(self-healing edge)* — when issues exist and turns remain, `correct.ts` (pure) selects the single highest-priority issue and emits a targeted question ("`payment-gateway` is already taken — what name should I use instead?"), persists the issue history on the session, and **suspends awaiting user input** rather than proceeding. Bounded by `maxCorrectionTurns`; exhaustion terminates as `unresolved_validation` with the residual issues. Correction turns re-enter at **coerce**, not at parse, so template selection is not relitigated.
6. **gate** — with zero blocking issues, emit the `template-intent-proposal` artifact, then `approval_request` carrying the template ref, the fully resolved parameter set, and its `parameterHash`; checkpoint and **suspend**. When `execute.enabled` is false the run finalizes here as `proposed` — a legitimate terminal state, not a failure.
7. **trigger** *(resume path)* — `resume(runId, decision, context)`: on `confirmed`, re-validate that the frozen parameters still coerce clean and the name is still available (a collision can appear between gate and confirm), then call `scaffolderServiceRef.scaffold()` with the **confirming user's** credentials, emit a `template-intent-execution` artifact with the returned task ID plus an audit record, and finish `executed`; on `rejected`, record the decision and finish `declined` with no task.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'template' | 'catalog' | 'policy' | 'knowledge'; summary: string; reference?: string };

type IntentFacts = {              // model-extracted, schema-constrained
  kind?: string;                  // 'website' | 'service' | 'library' ...
  proposedName?: string;
  language?: string;
  framework?: string;
  ownerHint?: string;
};

type TemplateCandidate = {
  templateRef: string;            // allow-listed ref only
  title?: string;
  score: number;                  // deterministic overlap score
  matchedOn: string[];            // which facts drove the score
  evidence: string[];             // tpl-N
};

type ParameterProposal = {
  field: string;                  // schema-declared field name
  value: unknown;                 // coerced to the schema's declared type
  origin: 'utterance' | 'correction' | 'default' | 'identity';
  evidence: string[];             // tpl-N / cat-N
};

type ValidationIssue = {
  id: string;                     // 'iss-1' ...
  field?: string;                 // offending parameter
  kind: 'name_taken' | 'missing_field' | 'type_mismatch' | 'pattern_mismatch'
      | 'enum_mismatch' | 'repo_invalid' | 'policy_violation';
  message: string;                // verbatim from schema/catalog/driver
  blocking: boolean;              // true prevents reaching the gate
  question?: string;              // targeted correction prompt
  evidence: string[];             // cat-N / tpl-N / policy
};

// IntentState: { request, facts?, candidates: TemplateCandidate[], selected?: string,
//   parameters: ParameterProposal[], issues: ValidationIssue[], turns: number,
//   limitations: string[],
//   status: 'proposed'|'awaiting_correction'|'executed'|'declined'
//         |'no_template_match'|'unparseable'|'unresolved_validation' }

type ScaffolderIntentProposal = {
  utterance: string;
  sessionId: string;
  status: IntentState['status'];
  selectedTemplate?: string;
  candidates: TemplateCandidate[];
  confidence: 'high' | 'medium' | 'low';
  parameters: ParameterProposal[];
  issues: ValidationIssue[];
  turns: number;                  // correction turns consumed
  parameterHash?: string;         // canonical hash of the resolved parameter set
  limitations: string[];
  evidence: EvidenceRef[];        // tpl-N + cat-N (+ policy/kb) bundle
};

type TemplateIntentExecution = {
  sessionId: string;
  templateRef: string;
  taskId: string;                 // from ScaffolderScaffoldResponse
  parameterHash: string;          // matches the confirmed proposal
  confirmedBy: string;
  proposalRef: string;            // artifact ref of the confirmed proposal
};
```

Status mapping is fixed in code, not inferred: blocking issues with turns remaining → `awaiting_correction`; zero blocking issues with `execute.enabled: false` → `proposed`; confirmed and spawned → `executed`; rejected → `declined`; ranking below `minSelectionScore` → `no_template_match`; no actionable facts → `unparseable`; turns exhausted → `unresolved_validation`. `confidence` is `low` whenever the top two candidate scores fall within `ambiguityMargin` or any limitation is present.

## Schema-Grounded Parameter Coercion (New Structural Section)

The foundation doc's core demand is strict compliance with real `Template` parameter schemas, so the schema — not the model — is the authority on every value.

- `coerce.ts` is pure and schema-first: `(facts, corrections, schema) => { parameters, issues }`. It has no AI Core, tool, or clock dependency, so every coercion rule is unit-testable against fixture schemas.
- The schema comes from the **live** `getTemplateParameterSchema`, never hard-coded or inferred from a prompt. A field absent from the schema is dropped with a limitation; a model-proposed value for an undeclared field can never reach the parameter set.
- Coercion is explicit and ordered: type conversion → enum snapping (nearest declared value, else `enum_mismatch`) → `pattern`/`format` check → required-field presence → schema defaults. Each surviving value records its `origin`, so a reviewer can distinguish a user-stated value from a default.
- Every value carries evidence; `proposal.ts` re-validates the model narrative against the coerced record and strips claims asserting a different value.
- Because Backstage `TemplateParameterSchema` is **multi-step**, coercion flattens across steps and reports which step each field came from — otherwise a required field on step 2 would be silently missed.

## Self-Healing Validation Loop (New Structural Section)

This is the foundation doc's headline behavior: a failed live check must loop for a correction, never execute a broken step.

- `validate.ts` is pure over already-fetched results (catalog probe, schema residue, optional policy/repo checks), so the collision logic is testable without a live catalog.
- **One question per turn.** `correct.ts` picks the highest-priority blocking issue and asks a single targeted question naming the field and the reason. Asking about five fields at once is what makes conversational form-filling worse than a form.
- The loop is **bounded and monotonic**: `maxCorrectionTurns` (default 3), and a turn that fails to reduce the blocking-issue count aborts as `unresolved_validation` rather than looping on an unhelpful answer.
- Correction turns re-enter at **coerce**, so the template selection and prior valid fields survive; only the corrected field is re-evaluated. Issue history persists on the session so the same question is never asked twice.
- The name-availability probe is the canonical case: `NameAvailabilityChecker` builds the prospective entity ref from the coerced name and probes the catalog. A hit is a `name_taken` blocking issue citing `cat-N` — deterministic, cheap, and exactly the foundation doc's scenario.
- **Recheck at confirm.** Availability is re-probed on resume because another user may have claimed the name while the run sat at the gate; a late collision aborts the trigger rather than spawning a doomed task.

## Confirmation Gate And Task Trigger (New Structural Section)

Spawning a provisioning workflow costs real resources, so the gate is the plugin's most safety-critical boundary.

- The gate uses the existing `ApprovalRequest`/`ApprovalDecision` types, `CheckpointStore`, and `AuditLogSink` — no new machinery. The `approval_request` payload carries the template ref, the full resolved parameter set, and `parameterHash`.
- **The write is not model-reachable.** `scaffold()` is called from `trigger.ts` on the resume path only, via the injected service — there is no tool exposing it, so no amount of prompt injection or hallucinated tool call can spawn a task. This is a structural guarantee, not a prompt instruction.
- `resume()` is idempotent by `(sessionId, parameterHash)`: a repeated confirmation returns the existing `TemplateIntentExecution` instead of spawning a second task. Double-submitting the confirm button must not create two services.
- The task runs with the **confirming user's** `BackstageCredentials` (the `ScaffolderServiceRequestOptions` shape), so Scaffolder's own authorization applies and the agent cannot escalate privilege.
- `execute.enabled` defaults to **false**: the plugin ships advisory, terminating at `proposed`, and an operator opts into task creation deliberately.
- Audit records capture template ref, `parameterHash`, `confirmedBy`, and the returned `taskId`; rejections are audited too so declined provisioning is visible.

## Multi-Turn Session State (New Structural Section)

- `IntentSessionStore` keeps conversation context, accumulated `ValidationIssue` history, turn count, and the idempotency record using **AI Core session memory plus runtime stores** — not the foundation doc's bespoke conversation table.
- Idempotency key is the canonical hash of `(utterance, templateRef, resolved parameters, requester)`. A rapid duplicate submission replays the existing proposal rather than re-running parse/select/coerce, conserving model budget.
- A session retires on `executed`, `declined`, or after `sessionTtlHours`. A materially different utterance starts a new session; a corrected field continues the existing one.
- Session state is scoped to the requesting user and never shared across users, since it contains their intent text and proposed names.

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` supplies template-selection guidance ("which template do we use for a React frontend?") as ranking *evidence* and prose. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; session/run state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** choose the template, set a parameter value, or suppress a `ValidationIssue`. Tests assert the selected template, coerced parameters, and issue list are byte-identical with retrieval enabled and disabled.

## Configuration

```yaml
ai:
  agents:
    scaffolderIntent:
      model: scaffolder-intent      # installation-registered model ID, required
      maxUtteranceChars: 1000       # optional, default 1000
      maxToolInvocations: 10        # optional, default 10
      maxCorrectionTurns: 3         # optional, default 3 self-healing turn cap
      sessionTtlHours: 4            # optional, default 4 conversation lifetime
      minSelectionScore: 0.35       # optional, default 0.35; below -> no_template_match
      ambiguityMargin: 0.1          # optional, default 0.1; within -> confidence low
      templates:                    # REQUIRED, non-empty; the only selectable templates
        allowed:
          - template:default/react-service-template
          - template:default/node-backend-template
          - template:default/library-template
      validation:
        checkCatalogName: true      # optional, default true (the collision probe)
        checkRepoName: false        # optional, default false; needs a VCS driver
        checkPolicy: false          # optional, default false; advisory only
      execute:
        enabled: false              # optional, default false; gates scaffold()
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section, `model`, or a non-empty `templates.allowed` is absent; document every default in `config.d.ts`. Validate at boot that every allowed ref parses as a template entity ref, and log a warning (not a failure) if `getTemplateParameterSchema` cannot resolve one — a de-registered template should degrade selection, not block startup. Task creation requires **both** `execute.enabled: true` and a confirmed decision.

## Shared AI-Core Work To Build First

- **No Scaffolder core helper is required.** This plugin consumes the real, installed `scaffolderServiceRef` (`getTemplateParameterSchema` / `scaffold` / `dryRun`) directly. Do **not** build a bespoke Scaffolder abstraction here, and do not implement the foundation doc's `scaffolder.service` sketch.
- **Catalog adapter reuse** — `NameAvailabilityChecker` should follow the existing `CatalogContextResolver` shape (narrow `CatalogClientLike` with `getEntityByRef`/`getEntities` plus a `CatalogTokenProvider`) rather than inventing a new abstraction; promote to `plugin-ai-core-node/src/catalog/` if the shared `CatalogEntityResolver` lands first.
- **Coordinate with `scaffolder-ai-guardrail-agent`** — both can call `compliance.*` on template parameters. Keep policy checks here **advisory** (`checkPolicy` default false) and let the guardrail agent own hard governance, so a request is not blocked twice by two plugins with different severity tables.
- **No new coercion, approval, or persistence machinery in core** — `parse.ts`/`select.ts`/`coerce.ts`/`validate.ts`/`correct.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, session memory, and runtime stores all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-intent/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # IntentRequest/Proposal/Execution wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # scaffolderIntentApiRef
      client.ts                   # ScaffolderIntentClient: submitIntent(), sendCorrection(), streamRunEvents(), submitConfirmation()
    hooks/
      index.ts                    # barrel
      useIntentSession.ts         # pure reducer + hook (submit/correct/confirm/reject/reset)
    components/
      index.ts                    # barrel
      IntentRequestPage.tsx       # standalone: natural-language entry + session view
      IntentInputForm.tsx         # the utterance box ("create a react app called ...")
      IntentRunView.tsx           # live node/tool progress from SSE
      TemplateCandidateList.tsx   # ranked candidates with scores + matchedOn, pick-one
      ParameterReviewTable.tsx    # field / value / origin, inline editable
      CorrectionPrompt.tsx        # the one targeted question + answer input
      ValidationIssueList.tsx     # blocking vs advisory issues with cat-N citations
      ConfirmationGate.tsx        # final template + parameters + confirm/reject
      TaskBanner.tsx              # spawned task ID + deep link on success
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'scaffolder-ai-intent'`; package `@ai-crew-suite/plugin-agent-scaffolder-intent`.
- Primary surface is a **standalone intent page** (nav item) via `PageBlueprint`. No `EntityCardBlueprint` — nothing exists in the catalog yet at request time, which is the whole point.
- **The conversational loop is the defining UX.** `CorrectionPrompt` renders exactly one question per turn with the offending field highlighted in `ParameterReviewTable`; answering it calls `sendCorrection()` with the same `sessionId` so the backend continues rather than restarts.
- `ConfirmationGate` shows the complete final parameter set (not a summary) plus `parameterHash`, because this is the last checkpoint before real resources are provisioned. It must be visually distinct from the correction turns.
- `TaskBanner` links the spawned Scaffolder task by its returned `taskId`, handing the user off to the standard Scaffolder task view rather than reimplementing progress.
- `proposed` (execution disabled), `no_template_match`, `unparseable`, and `unresolved_validation` render as first-class explained outcomes, not errors; `TemplateCandidateList` is the recovery affordance for `no_template_match`.
- Parameters are **editable before confirmation**, but an override is submitted as a `correction` so it is re-coerced and re-validated server-side rather than trusted from the client.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `coerce.ts` against fixture `TemplateParameterSchema` objects — type coercion, enum snapping, `pattern` rejection, required-field detection, default application, multi-step flattening, and rejection of undeclared fields. `select.ts` ranking determinism, `minSelectionScore` cutoff, and `ambiguityMargin` → `confidence: 'low'`. `correct.ts` single-highest-priority selection and the monotonic abort. `parse.ts` fact normalization and the `unparseable` path.
- **Workflow (runtime) tests**: drive `IntentGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) plus fake `scaffolderService`/`catalogClient` adapters — the codebase-accurate replacement for the foundation doc's `scaffolder.service` `createServiceRef` sketch. **Headline scenario (the foundation doc's own test)**: utterance "Create a react app called payment-gateway" with a catalog already containing `Component:default/payment-gateway` → assert selection resolves to `react-service-template`, the validation node produces a `name_taken` blocking issue, status is `awaiting_correction` with a targeted question, and **`scaffold()` was never called**.
- **Self-healing continuation**: feed a correction (`payment-gateway-v2`) with the same `sessionId` → assert re-entry at coerce (selection unchanged), the collision clears, `turns === 1`, and the run reaches the gate. Then a persistently colliding answer exhausts `maxCorrectionTurns` → `unresolved_validation`, still no `scaffold()`.
- **Confirmation-gate hardening** (foundation doc §2): assert the run stays suspended at the gate and `scaffold()` is not called when the model hallucinates a tool call or attempts to skip a node; `resume('confirmed')` calls `scaffold()` **exactly once** with the confirming user's credentials and the checkpointed `parameterHash`; `resume('rejected')` calls nothing and yields `declined`; a repeated confirmation is idempotent (no second task); a name claimed between gate and confirm aborts the trigger.
- **Execution-disabled test**: with `execute.enabled: false`, a fully valid request terminates `proposed` and never calls `scaffold()`.
- **Allow-list tests**: a `templateHint` outside `templates.allowed` is rejected; a model-proposed template ref outside the allow-list can never become `selectedTemplate`.
- **Idempotency tests**: identical utterance + parameters resubmitted rapidly replays the existing proposal with zero additional model/tool calls; a materially different utterance starts a new session.
- **`knowledge.retrieve` isolation**: pre-baked template-guidance chunks; assert `selectedTemplate`, coerced parameters, and the issue list are byte-identical with retrieval on and off.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` (allow-list) + `mockServices.database`, plus stub `scaffolderServiceRef`/`catalogServiceRef` implementations, asserting boot registration, run→SSE ordering, checkpoint at the gate, resume flow, and proposal/execution artifact persistence.
- **E2E**: extend the shared fixture profile with fixture templates and a catalog entity that forces a collision. Playwright: type the utterance → see the candidate and pre-filled parameters → hit the collision → answer the correction → confirm → assert the task banner; plus a reject path and an `execute.enabled: false` proposal-only path. Add `yarn test:e2e:scaffolder-ai-intent`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Intent-specific additions:

- **No task without a persisted human confirmation**, and `execute.enabled` defaults to `false`. The confirmation, `confirmedBy`, template ref, `parameterHash`, and returned `taskId` are audit-logged; rejections are audited too.
- **The write is structurally unreachable by the model**: `scaffold()` lives behind an injected typed service with no tool binding, so no prompt injection or hallucinated tool call can spawn a task. Prompt rules are a second layer, not the control.
- The task is created with the **confirming user's** credentials, so Scaffolder's own permission checks apply and the agent cannot provision as a more privileged principal.
- Template selection is allow-list bounded; an unmatched intent returns candidates rather than a guess, so a user cannot be steered into an unvetted template by clever phrasing.
- The utterance is **untrusted input**: cap `maxUtteranceChars`, delimit it in the prompt with an instruction not to follow embedded directives, and never let it introduce parameter fields absent from the schema.
- Redact secret-shaped values from parameters before they reach the model, SSE, artifacts, or audit records — a user may paste a token into a free-text field.
- Session state contains intent text and proposed names: scope it to the requesting user, retain only for `sessionTtlHours`, and never persist it into vector storage.
- Catalog probes use the requester's identity so name-availability answers cannot leak the existence of entities the user may not read.

## Ordered Implementation Milestones

### Milestone 0: Contracts and pure engines

- [ ] Add `@backstage/plugin-scaffolder-node` to this package; confirm `scaffolderServiceRef`, `getTemplateParameterSchema`, and `scaffold` against the installed version, and confirm the `catalogServiceRef` adapter shape.
- [ ] Define `IntentRequest`, `IntentFacts`, `TemplateCandidate`, `ParameterProposal`, `ValidationIssue`, `ScaffolderIntentProposal`, `TemplateIntentExecution`, and the config schema.
- [ ] Implement + unit-test `parse.ts`, `select.ts`, `coerce.ts`, `validate.ts`, `correct.ts`, and the canonical parameter hash.

Exit criteria: coercion against fixture schemas, ranking determinism, and correction bounding all pass; schemas validate fixture payloads.

### Milestone 1: Proposal backend (no task creation)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement parse → select → coerce → validate → `template-intent-proposal`, with the `TemplateResolver` and `NameAvailabilityChecker` adapters.
- [ ] Wire into `packages/backend` (after `plugin-scaffolder-backend`) and add the `ai.agents.scaffolderIntent` config block.
- [ ] Add unit, workflow-scenario (mock router + fake services), and backend integration tests.

Exit criteria: the foundation doc's `payment-gateway` collision scenario produces a `name_taken` issue deterministically, with no real LLM and no task creation.

### Milestone 2: Self-healing loop and session state

- [ ] Implement `IntentSessionStore` (session memory + runtime stores), the correction turn re-entering at coerce, issue history, turn bounding, and idempotency replay.
- [ ] Continuation, monotonic-abort, and idempotency tests.

Exit criteria: a corrected name resolves within the same session; exhausted turns terminate cleanly; duplicate submissions cost no extra model calls.

### Milestone 3: Confirmation gate and task trigger

- [ ] Implement the gate + `IntentGraph.resume()`: checkpointed parameters, `approval_request`, re-validation on resume, `scaffold()` with the confirming user's credentials, `template-intent-execution` artifact, audit, and `(sessionId, parameterHash)` idempotency.
- [ ] Gate-hardening tests: hallucinated tool call, node-skip attempt, double-confirm, late collision, and `execute.enabled: false`.

Exit criteria: a task is provably created only after confirmation, exactly once, and never by model action.

### Milestone 4: Frontend and E2E

- [ ] Implement the frontend (`ApiBlueprint` + `PageBlueprint`, intent page, candidate list, parameter table, correction prompt, confirmation gate, task banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, awaiting_correction, no_template_match, unparseable, proposed, executed, declined, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright correction, confirm, and reject scenarios with screenshot review.

Exit criteria: `yarn test:e2e:scaffolder-ai-intent` demonstrates utterance → collision → correction → confirm → task, plus a reject path, in a browser without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, template allow-list curation, execution enablement, permission requirements, and the proposal-vs-execution distinction.
- [ ] Dashboards/alerts for intent volume by status, collision rate, **average correction turns**, no-template-match rate, confirmation/rejection ratio, and token cost per session.
- [ ] Opt-in real-model evaluation suite (grounding: selected template is allow-listed, every parameter is schema-declared with a cited origin, no invented fields or owners) within budget.

Exit criteria: staged rollout with execution disabled by default, bounded costs, and verified schema grounding.

## Frontend Completed

- Backstage frontend plugin with:

  - Plugin ID: `scaffolder-ai-intent`
  - Standalone route: `/scaffolder-ai-intent`
  - Legacy `plugin.ts` entry point
  - New frontend-system `/alpha` entry point
  - `ApiBlueprint` and `PageBlueprint`

- Typed authenticated AI Core SSE client:

  - Starts proposals through `agents/scaffolder-ai-intent/runs`
  - Replays runs through `?run=<runId>`
  - Uses `ai.endpointPath`, defaulting to `ai-core`

- Typed reducer/hook with malformed artifact protection.

- Proposal-only UI:

  - Natural-language provisioning request form
  - Live run-step progress
  - Allow-listed template candidates with scores and matches
  - Schema-declared resolved parameters and origins
  - Validation issues with blocking/advisory state, evidence IDs, and targeted correction text
  - First-class `proposed`, `awaiting_correction`, `no_template_match`, and `unparseable` rendering
  - Proposal limitations clearly state that no Scaffolder task is created

### Important scope alignment

The current backend only supports the proposal milestone. Therefore the frontend deliberately does __not__ render controls for:

- Sending correction turns
- Editing/re-submitting parameters
- Confirming/rejecting a proposal
- Creating or linking a Scaffolder task

When `awaiting_correction` is returned, the UI renders the backend's targeted question as informational and explains that continuation is not yet available.

### Registration updated

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests added

- Reducer test for valid and malformed `template-intent-proposal` artifacts.

- Proposal panel test covering:

  - template candidate display
  - resolved parameter display
  - blocking name-collision issue
  - targeted correction question
  - proposal-only limitation

- App feature registration test passed.

## Backend Completed

- AI Core backend module:

  - Agent ID: `scaffolder-ai-intent`
  - Workflow ID: `scaffolder-intent`
  - Manual trigger
  - Session memory declaration
  - Read-only supplemental tool allow-list

- Config parsing for:

  - required model
  - required allow-listed `templates.allowed`
  - utterance-size limit
  - selection threshold
  - catalog name validation
  - execution-enabled setting, retained but not used in this proposal-only milestone

- Schema-backed template proposal pipeline:

  1. Validates versioned manual intent requests.
  2. Extracts bounded facts from simple provisioning phrasing, including name and kind.
  3. Ranks only configured allow-listed template references.
  4. Fetches live template parameter schemas through `scaffolderServiceRef`.
  5. Flattens multi-step schemas.
  6. Emits only schema-declared name/default parameters.
  7. Reports missing required template fields.
  8. Performs catalog component-name collision checks.
  9. Emits a replayable `template-intent-proposal` artifact.

- Collision safety behavior:

  - `Create a react app called payment-gateway` with an existing catalog component emits:

    - selected allow-listed template
    - `name_taken` blocking issue
    - targeted correction question
    - `awaiting_correction` status

  - No `scaffold()` call exists in the workflow path.

### Registration

Updated:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

### Tests

Added focused tests for:

- Multi-step schema flattening, defaults, and missing required fields.
- Catalog name collision producing `awaiting_correction`.
- Verification that live template-schema lookup is used.

## Definition of Done

- Package, agent, runner (`run` + `resume`), manual trigger, config schema, and the read-only tool allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, session continuity across correction turns, a checkpoint at the gate, and `template-intent-proposal` / `template-intent-execution` artifacts.
- Template selection, schema coercion, validation verdicts, and the trigger decision are pure deterministic code — never model output — and every parameter value is schema-declared with a recorded origin.
- The self-healing loop provably converts the `payment-gateway` collision into a targeted question, resolves on correction within the same session, and terminates cleanly when turns are exhausted.
- Task creation is reachable **only** through `resume()` with a persisted confirmation, runs with the confirming user's credentials, is idempotent per `(sessionId, parameterHash)`, and is impossible via any tool call.
- Frontend renders candidates, parameters, corrections, and the confirmation gate over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies the correction and confirm/reject paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests) contains secrets, uncited parameter values, invented template refs, or a spawned task lacking a recorded human confirmation.
