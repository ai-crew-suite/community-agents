# Scaffolder AI Infra Implementation Plan

## Overview

This plugin automatically generates Infrastructure as Code (IaC) files matching your organization's compliance blueprints directly during the project scaffolding step.

- **The Task**: Generating tailored, security-hardened infrastructure-as-code files directly during software provisioning runs.
- **The Logic**: Rather than acting as a loose, standalone code generator, this tool executes as an integrated **Scaffolder Action step**. When a software template is triggered, a stateful LangGraph multi-agent network split by technology roles (**Terraform Expert node** vs. **CloudFormation Expert node**) reads the specific capacity variables, pulls base corporate modules via the `urlReader`, generates structural configurations, runs pre-flight syntax checks, and returns compliant code blocks to the active workspace.

Here are the concrete examples of what the data sources and dependencies look like in a Backstage ecosystem:

1. Catalog Dependencies (Context & Naming Registry)

Before generating code, the agent queries the **Backstage Software Catalog** to extract entity definitions and global resource limits.

- **`Resource` & `System` Entities**: The agent inspects existing Catalog resources to ensure it doesn't create duplicate cloud setups. For example, if it needs to provision a database for a service, it checks the catalog to ensure an active `Resource` with that identifier doesn't already exist.
- **Organizational Ownership (`Group` Entities)**: The agent pulls ownership metadata from the catalog to inject precise tag keys into the `main.tf` file. This ensures every cloud resource is automatically tagged with its valid Backstage team owner (e.g., `tags = { Owner = "team-checkout" }`).
- Policy Registries (Compliance Guardrails)

Instead of hardcoding compliance logic inside your prompt templates, your LangGraph validation nodes query external governance engines or static schema definition objects.

- **Open Policy Agent (OPA) / Rego Registry**: Your company might maintain an OPA server to enforce infrastructure policies. The LangGraph validation node passes the generated code strings to OPA to run automated compliance checks before writing to the workspace.
  - _Example policy_: "Databases cannot have public IP addresses exposed to the internet."
  - _Example check_: If the agent generates an `aws_db_instance` with `publicly_accessible = true`, the OPA policy registry rejects it, and the graph loops backward to force a self-correction.
- **Backstage Permission Policies**: The registry validates whether the user triggering the Scaffolder template actually has the permission to provision the requested resource tier (e.g., restricting large production-grade cluster sizes to authorized team leads).
- **Static Architecture Policies**: A centralized file registry defining valid configuration criteria—such as lists of allowed AWS regions, standard instance families, and mandatory encryption algorithms.

## Goal

Implement `@ai-crew-suite/plugin-agent-scaffolder-infra-backend` as a **custom Scaffolder action** (plus a companion AI Core runner for persisted preview/replay) that generates security-hardened Infrastructure-as-Code inside the live Scaffolder workspace during a template run. It reads capacity/provider parameters from the action input, pulls the organization's approved base blueprint via `coreServices.urlReader`, deterministically routes to a **Terraform expert** or **CloudFormation expert** generator node, injects catalog-derived ownership tags, validates the emitted files against policy and syntax, self-corrects a bounded number of times on validation failure, and only then writes the files into the workspace. A paired frontend plugin renders generation previews, validation findings, and run history.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions). This plan documents only what differs: the **Scaffolder action boundary**, **role-routed generation**, the **self-correcting validation loop**, and **workspace write semantics**.

## Delivery Boundary

### In scope

- One infra-generation request per action invocation (or per `/agents/scaffolder-ai-infra/runs` call for preview), scoped to a single service and provider.
- Deterministic `intake → blueprint.load → route → generate → validate → correct → emit` graph. Routing, required-field checks, policy rejection, and the workspace write are pure code; the model fills bounded template holes only.
- Bounded reads: approved blueprints via `coreServices.urlReader` and `vcs.repository.read_file`; catalog ownership/duplication checks via the catalog adapter; policy verdicts via `compliance.policy.evaluate` / `compliance.architecture.validate`.
- A **self-correcting** validation edge: syntax/semantic failures are fed back to the generating expert node up to `maxCorrectionRounds`.
- Files written **only** into the action's `ctx.workspacePath`, after all validation passes.
- A structured, citation-required `InfraGenerationReport` artifact for preview/replay, plus streaming run events.
- A minimal frontend: preview page, generation dialog, live SSE run view, per-file preview, validation-findings panel, run history.

### Explicitly out of scope for v1

- **Provisioning or applying infrastructure.** No `terraform apply`, no cloud SDK writes, no `cloud.*` mutation. The action emits *files*; a later pipeline applies them.
- Opening pull requests or committing to a repository — the workspace write is the only file-system effect, and it stays inside the scaffolder task sandbox.
- Generating credentials, secrets, key material, or IAM trust policies granting broad privileges; these are hard-blocked, not merely discouraged.
- Authoring or mutating the corporate blueprints themselves; the agent only reads approved sources.
- Multi-provider or multi-service fan-out in one run; one provider + one service per invocation.
- Free-form IaC unconstrained by a blueprint — if no approved blueprint resolves for the requested provider, the run terminates `blueprint_unavailable` rather than improvising.

## Required Prerequisites

Contracts verified against the current codebase and the installed Backstage SDK. As with the catalog plan: no fictional service refs — the foundation doc's `ScaffolderService` sketch must not be implemented as written.

**Verified, and unusually favorable:** unlike the sibling `scaffolder-*` agents, this plugin's integration surface **already exists**. `@backstage/plugin-scaffolder-node@0.13.5` is an installed workspace dependency (already consumed by `plugin-ai-core-backend-module-vcs`) and exports `createTemplateAction`, `scaffolderActionsExtensionPoint`, and an `ActionContext` type carrying `workspacePath`, `input`, `logger`, `checkpoint()`, `output()`, `getInitiatorCredentials()`, `task.id`, `templateInfo`, and `isDryRun`. A real Scaffolder action is viable in v1 — there is no blocking integration gate.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Scaffolder action registration | `createTemplateAction`, `scaffolderActionsExtensionPoint` from `@backstage/plugin-scaffolder-node` | **Exists** (v0.13.5 installed; `ActionContext` exposes `workspacePath`/`input`/`checkpoint`/`isDryRun`) | Register the action from a `pluginId: 'scaffolder'` backend module; add the dependency to this package's `package.json`. |
| Workspace file write | `ctx.workspacePath` + `fs-extra` | **Exists** | Resolve every output path against `workspacePath` and reject traversal. Honor `ctx.isDryRun` by reporting without writing. |
| Approved blueprint fetch | `coreServices.urlReader` | **Exists**, used across the VCS modules | Read hardened base modules from the config-declared allow-list only; cap bytes. |
| Blueprint from a repo | `vcs.repository.read_file` | Exists, `effect: read` | Alternative source when the blueprint lives in a Git repo rather than at a URL. |
| Generated-IaC policy check | `compliance.policy.evaluate` | **Exists**, `effect: read`; its registered description is literally "Evaluate generated IaC, config, or proposed actions against OPA/Rego or static policy bundles" | Primary guardrail on the *generated* files. `passed: false` blocks the workspace write. |
| Architecture constraints | `compliance.architecture.validate` | **Exists**, `effect: read` | Validate capacity/region/public-access shape before generation and re-validate the emitted files. |
| Ownership tags + duplicate check | Catalog access via a `catalogServiceRef` adapter | Pattern **exists** (`CatalogContextResolver` in catalog-ai-insights uses `getEntityByRef`) | Reuse that adapter shape to inject `tags = { Owner = ... }` and to detect a pre-existing `Resource` before generating. |
| Blueprint/pattern context | `knowledge.retrieve` + `DefaultRetrievalPipeline` | Exists | Optional; module-usage guidance only. Must never override blueprint text or a policy verdict. |
| Run persistence / preview / cost | AI Core runner, artifacts, checkpoints, token accounting | Exist | The companion runner gives the action persisted replayable runs and cost accounting (the foundation doc's "token accounting recorded" requirement). |
| **Action test harness** | `createMockActionContext` from `@backstage/plugin-scaffolder-node-test-utils` | **Not installed** — absent from `node_modules` and `yarn.lock` | Add it as a `devDependency`, or implement a local typed `createTestActionContext()` helper. **Blocking for the action test layer only.** |

## Package Shape

Backend module from the same template as `catalog-ai-insights`, with one structural difference: this package exports **two** backend modules — the AI Core agent module and a Scaffolder action module. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-scaffolder-ai-infra/
  package.json          # role: backend-plugin-module; deps incl. @backstage/plugin-scaffolder-node
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: both module features + public types
    module.ts           # createBackendModule pluginId 'ai-core'  -> runner/agent/trigger
    scaffolderModule.ts # createBackendModule pluginId 'scaffolder' -> registers the action
    agent.ts            # SCAFFOLDER_INFRA_AGENT_ID, tool allow-list, per-role system prompts
    config.ts           # readScaffolderInfraConfig (ai.agents.scaffolderInfra)
    actions/
      index.ts          # barrel
      generateInfra.ts          # createTemplateAction('ai:infra:generate') wrapper
      workspaceWriter.ts        # path-safe writes under ctx.workspacePath, dry-run aware
    workflow/
      index.ts          # barrel
      InfraGraph.ts             # WorkflowRunner id 'scaffolder-infra'
      state.ts                  # InfraGenerationState (shared infra variables)
      intake.ts                 # request validation + capacity/provider normalization
      blueprint.ts              # urlReader / vcs.repository.read_file blueprint loading
      route.ts                  # pure: provider -> 'terraform' | 'cloudformation' role
      generate.ts               # role-scoped generation: bounded blueprint hole filling
      validate.ts               # syntax + light semantic + policy validation -> Finding[]
      correct.ts                # pure: findings -> bounded correction instruction set
      report.ts                 # InfraGenerationReport schema, validation, degradation
    services/
      index.ts          # barrel
      BlueprintRegistry.ts      # config allow-list -> resolved blueprint source
      CatalogInfraResolver.ts   # catalogServiceRef adapter: owner tags + duplicate Resource
      InfraToolRunner.ts        # capped invokeTool facade (mirrors InvestigationToolRunner)
      InfraArtifactWriter.ts
    @types/
      index.ts          # barrel: shared request/report/file contracts
    __tests__/
    actions/__tests__/
    workflow/__tests__/
    services/__tests__/
```

- AI Core module: `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-scaffolder-ai-infra'`; deps `coreServices.rootConfig`, `coreServices.logger`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`.
- Scaffolder module: `createBackendModule` with `pluginId: 'scaffolder'`, `moduleId: 'ai-infra-action'`; deps `coreServices.rootConfig`, `coreServices.logger`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, plus `scaffolderActionsExtensionPoint`. **No new core service keys are introduced.**
- `coreServices.scheduler` is intentionally **unused**: generation is strictly request/task-driven, so there is no background-task section in this plan.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Two backend loads**: add `"@ai-crew-suite/plugin-agent-scaffolder-infra-backend": "workspace:^"` to `packages/backend/package.json`, then add **both** features in `packages/backend/src/index.ts` — the `ai-core` agent module and the `scaffolder` action module. The action module must be added **after** `@backstage/plugin-scaffolder-backend` so the extension point exists.
- **Action availability**: the action only appears to templates once its module is loaded; a template referencing `ai:infra:generate` before that fails at task execution. Document the action ID and input schema in the package README.
- **Compliance module gate**: post-generation policy validation requires `plugin-ai-core-backend-module-compliance` plus a driver. With no driver configured, validation degrades to syntax-only and the report carries an explicit limitation — the write still proceeds only if syntax passes, and the limitation must be surfaced.
- **App config**: the module throws at boot without `ai.agents.scaffolderInfra.model` and at least one entry under `blueprints.sources`; add the config block (see Configuration) before enabling the loads.
- **Frontend registration**: add `"@ai-crew-suite/plugin-agent-scaffolder-infra": "workspace:^"` to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'scaffolder-ai-infra',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'scaffolder-infra'
  workflowRef: 'scaffolder-infra',
  memory: 'none',                     // each generation is a fresh blueprint + parameter set
  systemPrompt: SCAFFOLDER_INFRA_SYSTEM_PROMPT,   // base; role prompts layered per node
  toolIds: [
    'vcs.repository.read_file',
    'compliance.policy.evaluate',
    'compliance.architecture.validate',
    'knowledge.retrieve',
  ],
  triggers: [
    { id: 'infra-generate-on-demand', source: 'manual', agentId: 'scaffolder-ai-infra' },
  ],
}
```

- **Every registered tool is `effect: 'read'`.** There is no write tool: the only mutation is the workspace file write performed by the *action* under `ctx.workspacePath`, deliberately outside the tool/approval system because it is sandboxed to the scaffolder task and discarded if that task fails.
- Blueprint fetching uses `coreServices.urlReader` directly (not a tool) because it is an infrastructure read bound by the config allow-list, mirroring how the VCS modules consume it.
- Two **role system prompts** layer over the base prompt, selected by `route.ts`: `TERRAFORM_EXPERT_PROMPT` and `CLOUDFORMATION_EXPERT_PROMPT`. Each receives only its own dialect's blueprint and is instructed to emit that dialect exclusively.
- System prompt rules: fill **only** the marked holes in the supplied blueprint — never restructure it, never add resources it does not declare, never invent module sources or versions; emit no credentials, secrets, key material, or wildcard IAM; capacity/region/name values are supplied pre-validated and must be used verbatim; cite `bp-N`/`cat-N`/`kb-N` evidence IDs for every non-blueprint value; return only file contents in the requested dialect.

## Run Input Contract

The action input schema and the runner payload share one versioned shape. As an action it is `ai:infra:generate` input; as a run it is the JSON `AgentRunInput.input.query`.

```ts
type InfraGenerationRequest = {
  version: 1;
  source: 'action' | 'manual';
  provider: 'terraform' | 'cloudformation';   // required; drives role routing
  serviceName: string;                        // required; 'order-processor'
  entityRef?: string;                         // component ref for ownership tags
  environment?: string;                       // 'test' | 'staging' | 'prod'
  capacity?: {                                // validated against config maxima
    cpu?: number;
    memoryMb?: number;
    storageGb?: number;
    instanceType?: string;
  };
  region?: string;                            // checked against the allowed region set
  blueprintId?: string;                       // select a specific approved blueprint
  outputDir?: string;                         // workspace-relative; default '.'
};
```

Validation requires `provider` and `serviceName`, coerces `serviceName` to the platform naming convention, rejects capacity above `capacity.max*`, rejects a `region` outside `allowedRegions`, rejects unknown fields, and resolves `outputDir` against `ctx.workspacePath` with traversal (`..`, absolute paths, symlinks) refused before any generation begins.

## Generation Workflow

`InfraGraph` registers as `WorkflowRunner` id `scaffolder-infra`. It realizes the foundation doc's graph: **Parse Params → Router → (Terraform Node | CloudFormation Node) → Lint & Validation Node → Update Local Workspace**, with a self-correcting edge from validation back to the generating node. Routing, validation, and the write are deterministic; the model only fills blueprint holes.

### Deterministic graph nodes

1. **intake** — validate `InfraGenerationRequest`; `intake.ts` normalizes capacity units and the service name, then `CatalogInfraResolver` resolves the owning group for tags (`cat-N` evidence) and checks for a **pre-existing `Resource`** with the same identifier. A duplicate terminates as `duplicate_resource` before any model call, satisfying the foundation doc's "doesn't create duplicate cloud setups" requirement.
2. **preflight** — `compliance.architecture.validate` checks the *requested shape* (capacity, region, public-access flags) before spending tokens. A violation terminates as `policy_rejected` carrying the driver's constraint messages; nothing is generated.
3. **blueprint.load** — `BlueprintRegistry` resolves the approved source for `(provider, blueprintId)` from the config allow-list **only**, then reads it via `coreServices.urlReader` (or `vcs.repository.read_file` for repo-hosted blueprints), capped at `maxBlueprintBytes`. Unresolvable or empty → terminal `blueprint_unavailable`; the agent never improvises IaC from scratch.
4. **route** — `route.ts` (pure, no LLM) maps `provider` to the expert role and its prompt/dialect/validator triple. Routing is a lookup, not an inference, so the foundation doc's "assert the router directed state to the Terraform Expert node" is directly assertable.
5. **generate** — one model call under the selected role prompt, given the blueprint text, the pre-validated parameters, and the owner tags. `generate.ts` parses the response into `GeneratedFile[]` (path + content), rejecting any path outside `outputDir` and any file whose extension does not match the dialect.
6. **validate** — `validate.ts` runs three layers in order, collecting `Finding[]`: (a) **dialect syntax** — HCL block/brace/quote balance and required-argument closure for Terraform, YAML/JSON parse plus a required top-level `Resources` for CloudFormation; (b) **light semantics** — every blueprint-declared variable bound, no undeclared references, no `TODO`/placeholder residue; (c) **policy** — `compliance.policy.evaluate` over the generated file contents. Any finding with `blocking: true` prevents the write.
7. **correct** *(self-correcting edge)* — when findings exist and rounds remain, `correct.ts` (pure) compiles a bounded, minimal instruction set from the findings and loops back to **generate** with the prior output plus the attached errors. Capped at `maxCorrectionRounds`; exhausting it terminates as `validation_failed` with the residual findings. This is the foundation doc's "passes the error block backward to the generating expert node" requirement.
8. **emit** — emit the `infra-generation-report` artifact. In the runner (preview) path the graph stops here. In the **action** path, `workspaceWriter.ts` then writes the validated files under `ctx.workspacePath`, calls `ctx.output('files', ...)`, and reports without writing when `ctx.isDryRun` is true.

### State and output schema

```ts
type EvidenceRef = { id: string; source: 'blueprint' | 'catalog' | 'policy' | 'knowledge'; summary: string; reference?: string };

type GeneratedFile = {
  path: string;                   // workspace-relative, always inside outputDir
  content: string;                // redacted before it reaches SSE/artifacts
  dialect: 'hcl' | 'yaml' | 'json';
  bytes: number;
};

type Finding = {
  id: string;                     // 'find-1' ...
  layer: 'syntax' | 'semantic' | 'policy';
  path?: string;                  // offending file
  line?: number;
  rule: string;                   // validator rule or driver-reported rule
  message: string;                // verbatim from validator/driver
  blocking: boolean;              // true blocks the workspace write
};

// InfraGenerationState: { request, role, blueprint?, files: GeneratedFile[],
//   findings: Finding[], corrections: number, limitations: string[],
//   status: 'generated'|'written'|'validation_failed'|'policy_rejected'
//         |'blueprint_unavailable'|'duplicate_resource'|'partial' }

type InfraGenerationReport = {
  serviceName: string;
  provider: 'terraform' | 'cloudformation';
  role: 'terraform-expert' | 'cloudformation-expert';
  status: InfraGenerationState['status'];
  blueprintId?: string;
  blueprintSource?: string;       // resolved allow-listed URL, credentials stripped
  files: { path: string; bytes: number; dialect: string }[];  // metadata; content in preview only
  findings: Finding[];
  corrections: number;            // self-correction rounds consumed
  ownerTag?: string;              // injected 'team-checkout'
  limitations: string[];
  evidence: EvidenceRef[];        // bp-N + cat-N + policy (+ kb-N) bundle
};
```

Status mapping is fixed in code, not inferred: validated files written by the action → `written`; validated files from the preview runner → `generated`; residual blocking findings after the correction cap → `validation_failed`; preflight architecture violation → `policy_rejected`; no approved blueprint → `blueprint_unavailable`; existing catalog `Resource` → `duplicate_resource`. `partial` covers syntax-only validation (no compliance driver) and always carries a limitation.

## Role-Routed Generation (New Structural Section)

The foundation doc's "multi-agent network split by technology roles" is realized as one graph with role-scoped prompts and validators, not as separate agents — this keeps token accounting, tool caps, and event streaming unified.

- `route.ts` is a pure lookup returning a `RoleBinding`: `{ role, promptRef, dialect, validators, fileNamer }`. Adding a provider (e.g. Pulumi) means adding one binding plus a validator, with no graph surgery.
- Each role receives **only** its own dialect's blueprint. A Terraform request never sees CloudFormation text, which removes the most common cross-dialect contamination failure.
- `fileNamer` is deterministic per role (Terraform → `main.tf`/`variables.tf`; CloudFormation → `template.yaml`), so output paths are never model-chosen. This is what makes the foundation doc's "confirm a valid `main.tf` was written" assertion stable.
- The shared `InfraGenerationState` carries the blueprint, parameters, and findings across nodes, so a correction round re-enters the *same* role with full context — the foundation doc's "shared infrastructure state variables".
- Role prompts are versioned constants in `agent.ts` covered by prompt-snapshot tests, so an edit that would loosen the "fill only marked holes" constraint fails review.

## Self-Correcting Validation Loop (New Structural Section)

The foundation doc explicitly requires recovery from LLM syntax slips, and equally requires that the loop cannot spin.

- `validate.ts` is pure over already-fetched policy results: given file contents it returns `Finding[]` with no I/O beyond the injected policy verdict, making every rule unit-testable on fixture files.
- **Syntax before semantics before policy**, short-circuiting per layer: an unparseable file is not worth a policy call, which keeps a malformed generation cheap.
- `correct.ts` compiles findings into a *minimal* instruction set — offending path, line, and verbatim validator message only. It never restates the whole file and never invents a fix, so the correcting model call stays small and grounded.
- The loop is bounded by `maxCorrectionRounds` (default 2) and is **monotonic**: a round that fails to reduce the blocking-finding count aborts immediately rather than consuming the remaining budget. Exhaustion is a first-class `validation_failed` outcome, never a silent partial write.
- Every round is recorded on the state and surfaced as `corrections`, so operators can alert on a rising self-correction rate as a model-quality signal.

## Workspace Write Semantics (New Structural Section)

This is the plugin's only mutation, so its boundaries are stated precisely.

- **All-or-nothing**: files are generated and validated fully in memory, then written in one pass. A blocking finding means **zero** files are written — the workspace is never left half-populated.
- Every path is resolved with `path.resolve(ctx.workspacePath, outputDir, file.path)` and asserted to remain within `ctx.workspacePath`; `..` segments, absolute paths, and symlinked parents are refused. Overwriting an existing workspace file requires `allowOverwrite: true` in config.
- `ctx.isDryRun` is honored: the report is produced and `ctx.output()` populated, but nothing is written — so template authors can preview the action inside Scaffolder's dry-run.
- The write is intentionally **not** an AI Core write tool and needs no approval gate: it is confined to the scaffolder task sandbox and discarded if the task fails, and nothing here can reach a repository, cluster, or cloud account. Stated explicitly so the absence of an approval gate reads as a reasoned decision rather than an oversight.
- `ctx.checkpoint()` wraps the write so a retried task step does not duplicate work, and `ctx.output('files', ...)` publishes the manifest for downstream template steps (e.g. a later publish step).

## Vector Store Integration

- **No new vector infrastructure.** `knowledge.retrieve` is a secondary path supplying module-usage guidance (how the approved base module is normally wired) so generated files follow house patterns. Indexing/storage remain owned by `plugin-ai-core-backend-module-retrieval-augmenter` and the pgvector/qdrant modules; run state by `plugin-ai-core-backend-module-runtime-store`.
- Retrieval **must never** override blueprint text, a policy verdict, a validator finding, or a routing decision. Tests assert the emitted files and findings are byte-identical with retrieval enabled and disabled for a fixed blueprint and parameter set.

## Configuration

```yaml
ai:
  agents:
    scaffolderInfra:
      model: scaffolder-infra       # installation-registered model ID, required
      maxBlueprintBytes: 65536      # optional, default 65536 per blueprint
      maxGeneratedBytes: 131072     # optional, default 131072 total output
      maxFiles: 8                   # optional, default 8 generated files
      maxToolInvocations: 10        # optional, default 10
      maxCorrectionRounds: 2        # optional, default 2 self-correction cap
      allowOverwrite: false         # optional, default false
      blueprints:                   # REQUIRED, non-empty; the only allowed sources
        sources:
          - id: aws-rds-base
            provider: terraform
            url: https://github.com/acme/terraform-modules/blob/main/rds/main.tf
          - id: aws-ecs-base
            provider: cloudformation
            url: https://github.com/acme/cfn-templates/blob/main/ecs/template.yaml
      policies:                     # evaluated over the GENERATED files
        - id: iac-security
        - id: iac-tagging
      capacity:                     # deterministic preflight maxima
        maxCpu: 8
        maxMemoryMb: 16384
        maxStorageGb: 512
      allowedRegions: ['us-east-1', 'us-west-2', 'eu-west-1']
      forbidPublicIngress: true     # optional, default true
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section, `model`, or a non-empty `blueprints.sources` is absent; document every default in `config.d.ts`. Validate at boot that each source declares a known `provider` and that its `url` is readable by the configured `urlReader` integrations — an unreachable or provider-less blueprint is a startup error, not a runtime surprise.

## Shared AI-Core Work To Build First

- **Action test harness (blocking for the action test layer only)** — either add `@backstage/plugin-scaffolder-node-test-utils` as a `devDependency` or implement a local typed `createTestActionContext()` returning the verified `ActionContext` shape (`workspacePath`, `input`, `logger`, `checkpoint`, `output`, `getInitiatorCredentials`, `task.id`, `isDryRun`). Nothing in the repo provides this today.
- **Catalog adapter reuse** — `CatalogInfraResolver` should follow the existing `CatalogContextResolver` (`getEntityByRef`) shape rather than inventing a new abstraction; promote it to `plugin-ai-core-node/src/catalog/` if the shared `CatalogEntityResolver` lands first.
- **No Scaffolder core helper is required for v1** — unlike the sibling `scaffolder-*` agents, this plugin consumes the real, installed `createTemplateAction`/`scaffolderActionsExtensionPoint` contract directly. Do **not** build a bespoke pre-flight abstraction here.
- **No new generation, validation, or persistence machinery in core** — `route.ts`/`validate.ts`/`correct.ts` are plugin-local pure modules; runner registration, artifacts, checkpoints, and token accounting all exist and are exercised as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` with lazy `import(...)` loaders, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`.

```text
plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-infra/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # InfraGenerationRequest/Report/File wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # scaffolderInfraApiRef
      client.ts                   # ScaffolderInfraClient: previewGeneration(), streamRunEvents(), listReports()
    hooks/
      index.ts                    # barrel
      useInfraRun.ts              # pure reducer + hook (preview/reset)
      useReportList.ts            # generation history for the preview page
    components/
      index.ts                    # barrel
      InfraPreviewPage.tsx        # standalone: history + on-demand preview
      ReportTable.tsx             # service, provider, role, status, findings count, deep links
      PreviewGenerationDialog.tsx # provider/serviceName/capacity/region inputs
      InfraRunView.tsx            # live node/role/tool progress from SSE
      GeneratedFileList.tsx       # per-file tabs with syntax-highlighted content
      FindingsPanel.tsx           # syntax/semantic/policy findings, blocking flagged
      CorrectionTimeline.tsx      # self-correction rounds and what each fixed
      GenerationStatusBanner.tsx  # written/generated/failed/rejected + limitations
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'scaffolder-ai-infra'`; package `@ai-crew-suite/plugin-agent-scaffolder-infra`.
- Primary surface is a **standalone preview page** (nav item) via `PageBlueprint`. No `EntityCardBlueprint` — the subject is a template run, not a catalog entity.
- **Preview only.** `previewGeneration()` POSTs `/agents/scaffolder-ai-infra/runs`, which is the runner path and therefore **never writes to a workspace**; the write happens exclusively inside a real Scaffolder task. The UI must label this clearly so a preview is not mistaken for provisioning.
- `CorrectionTimeline` is the distinguishing surface: it makes the self-correction loop visible (round → findings fixed → residual), the main debugging aid when a model repeatedly fails validation.
- `FindingsPanel` separates `blocking` from advisory findings, because only the former explain why files were not written.
- `blueprint_unavailable`, `duplicate_resource`, and `policy_rejected` render as first-class explained outcomes (not errors), each naming the blueprint/resource/constraint involved; `limitations` and the syntax-only degradation are always visible.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `route.ts` provider → role mapping including unknown-provider rejection. `validate.ts` per-layer rules on fixture files — unbalanced HCL braces, an unclosed required argument (the foundation doc's explicit case), CloudFormation missing `Resources`, unbound blueprint variable, `TODO` residue. `correct.ts` minimal-instruction compilation and the monotonic abort. `intake.ts` capacity/region/name coercion and rejection. `workspaceWriter.ts` path-traversal refusal (`..`, absolute, symlink) and `allowOverwrite` behavior.
- **Action tests** (the foundation doc's primary scenario): with `createMockActionContext` (or the local helper) build a context with `input: { provider: 'terraform', serviceName: 'order-processor', capacityCpu: 4 }` and `workspacePath: '/tmp/scaffolder-scratchpad'`; stub `urlReader` to return `variable "capacity" { type = number }`. Assert the router selected the **Terraform** role, the blueprint was read from the allow-listed source, a **valid `main.tf` exists at the workspace path**, `ctx.output('files', ...)` was populated, and token/cost accounting was recorded on the run.
- **Self-correction tests** (foundation doc §2): script the model to emit a file missing a required parameter closure on round 1 and a valid file on round 2; assert validation detected it, `correct.ts` fed the error back to the *same* role, `corrections === 1`, and the final workspace file is valid. Then script a persistently invalid model and assert `validation_failed`, `corrections === maxCorrectionRounds`, and **zero files written**.
- **Provider-parity tests**: the same request with `provider: 'cloudformation'` routes to the CloudFormation role, reads the CFN blueprint, and writes `template.yaml`; assert no HCL appears in that output and no YAML in the Terraform output.
- **Guardrail tests**: capacity above `maxCpu` and a region outside `allowedRegions` both terminate at **preflight** with `policy_rejected` and no model call; a generated file containing a credential-shaped literal or wildcard IAM is a `blocking` policy finding that blocks the write.
- **Dry-run test**: `ctx.isDryRun: true` produces a full report and populated `ctx.output()` but leaves the workspace directory empty.
- **Duplicate-resource test**: catalog returns an existing `Resource` for the service identifier → `duplicate_resource` before any model call.
- **Workflow (runtime) tests**: drive `InfraGraph.run()` with a stubbed `WorkflowContext` whose `invokeTool` is a **dynamic mock router keyed by `toolId` + args** — the codebase-accurate replacement for the foundation doc's `createServiceFactory` sketch — asserting the preview path emits `infra-generation-report` and never touches a filesystem.
- **Degradation tests**: no compliance driver → syntax-only validation, `partial` status, explicit limitation, and the write still gated on syntax passing.
- **`knowledge.retrieve` isolation**: pre-baked module-usage chunks; assert emitted files and findings are byte-identical with retrieval on and off.
- **Backend integration**: `startTestBackend` with both modules + AI Core + `mockServices.rootConfig` (blueprint sources/policies) + `mockServices.urlReader` (the foundation doc's `extraReaders` pattern), asserting the action registers on `scaffolderActionsExtensionPoint`, the agent registers on the AI Core points, run→SSE ordering, and artifact persistence.
- **E2E**: extend the shared fixture profile with a fixture blueprint source and compliance driver. Playwright: open the preview page → preview a Terraform generation → inspect files, findings, and the correction timeline → assert the status banner; plus a `policy_rejected` path. Add `yarn test:e2e:scaffolder-ai-infra`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Infra-specific additions:

- **Never provision.** No cloud SDK, no `terraform apply`, no `cloud.*` write. The plugin emits files into a task sandbox; a separate, human-governed pipeline applies them.
- **Blueprints are an allow-list, not a suggestion.** Only config-declared sources may be read; an arbitrary caller-supplied URL is refused. A missing blueprint terminates the run rather than triggering free-form generation.
- **No generated secrets.** Credential, key-material, and wildcard-IAM patterns are `blocking` findings enforced by the validator *and* forbidden by the role prompts — belt and braces, since a prompt alone is not a control.
- Path safety is enforced in code, not convention: every write target is asserted to resolve inside `ctx.workspacePath`, with traversal, absolute paths, and symlinked parents refused; existing files are preserved unless `allowOverwrite`.
- Blueprint content and generated files are **untrusted text** for prompt purposes: delimit them, forbid following instructions found inside them, and cap `maxBlueprintBytes`/`maxGeneratedBytes`/`maxFiles` so a hostile or runaway blueprint cannot exhaust the context or the disk.
- Redact tokens/credentials from blueprint URLs and file content before they reach the model, SSE, artifacts, or logs; the report stores file **metadata** plus preview content only, never a resolved credentialed URL.
- Respect `ctx.getInitiatorCredentials()` for catalog reads so a user cannot generate infrastructure referencing entities they cannot see; no background/service-identity path exists here.
- Cost/token accounting is recorded per run through the AI Core runner (including correction rounds), so a self-correction storm is visible and bounded rather than a silent budget leak.

## Ordered Implementation Milestones

### Milestone 0: Contracts and pure engines

- [ ] Add `@backstage/plugin-scaffolder-node` to this package; confirm `createTemplateAction`/`scaffolderActionsExtensionPoint`/`ActionContext` against the installed version. Resolve the action test harness (dependency or local helper).
- [ ] Define `InfraGenerationRequest`, `GeneratedFile`, `Finding`, `InfraGenerationReport`, `RoleBinding`, and the config schema (blueprint sources, policies, capacity maxima, regions).
- [ ] Implement + unit-test `intake.ts`, `route.ts`, `validate.ts` (all three layers), `correct.ts`, and `workspaceWriter.ts` path safety.

Exit criteria: routing, validation, correction bounding, and path safety are provably deterministic on fixtures; schemas validate fixture payloads.

### Milestone 1: Preview runner (no workspace write)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the `ai-core` runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement intake → preflight → blueprint.load → route → generate → validate → correct → `infra-generation-report` (preview only).
- [ ] Wire the `ai-core` module into `packages/backend` and add the `ai.agents.scaffolderInfra` config block.
- [ ] Add unit, workflow-scenario (mock router), and backend integration tests including the degradation matrix.

Exit criteria: both provider roles generate validated files deterministically with no real LLM, no compliance provider, and no filesystem writes.

### Milestone 2: Scaffolder action and workspace write

- [ ] Implement `generateInfra.ts` via `createTemplateAction('ai:infra:generate')` with a typed input schema, plus `workspaceWriter.ts` all-or-nothing writes, `ctx.checkpoint()` wrapping, `ctx.output('files', ...)`, and `isDryRun` handling.
- [ ] Register `scaffolderModule.ts` on `scaffolderActionsExtensionPoint` and load it in `packages/backend` after `plugin-scaffolder-backend`.
- [ ] Action tests (the foundation doc's Terraform scenario), self-correction tests, plus dry-run, path-traversal, overwrite, and duplicate-resource tests.

Exit criteria: a real action invocation writes a valid `main.tf` into the workspace, and every failure mode provably writes nothing.

### Milestone 3: Frontend and E2E

- [ ] Implement the frontend (`ApiBlueprint` + `PageBlueprint`, preview page, generation dialog, SSE run view, file list, findings panel, correction timeline, status banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, streaming, written/generated/validation_failed/policy_rejected/blueprint_unavailable/duplicate_resource, replay) plus accessibility checks.
- [ ] Extend the E2E fixture profile and add Playwright preview and rejection scenarios with screenshot review.

Exit criteria: `yarn test:e2e:scaffolder-ai-infra` demonstrates a full preview with findings and correction timeline, plus a rejection path, in a browser without external infrastructure.

### Milestone 4: Production readiness

- [ ] Document model registration, blueprint-source curation, compliance driver configuration, the action ID/input schema for template authors, and the preview-vs-action distinction.
- [ ] Dashboards/alerts for generation volume by status, validation-failure rate, **self-correction rate**, policy-rejection rate, and token/cost per generation.
- [ ] Opt-in real-model evaluation suite (grounding: generated files parse in their dialect, contain no invented resources or module sources, bind every blueprint variable, and carry the catalog owner tag) within budget.

Exit criteria: staged rollout with a small curated blueprint set, bounded costs, and verified generation grounding.

## Definition of Done

- Both backend modules (`ai-core` agent/runner and `scaffolder` action), config schema, read-only tool allow-list, and the typed action input implemented and registered (root + backend wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, token/cost accounting across correction rounds, and `infra-generation-report` artifacts.
- Provider routing, all three validation layers, correction bounding, and the workspace write are pure deterministic code — never model output — and the model only fills marked blueprint holes.
- The self-correction loop provably recovers a missing-closure generation within `maxCorrectionRounds` and provably terminates as `validation_failed` with **zero files written** when it cannot.
- The action writes only inside `ctx.workspacePath`, all-or-nothing, honoring `isDryRun` and refusing traversal/overwrite; nothing in the plugin can provision infrastructure, open a PR, or emit a credential.
- Frontend renders files, findings, and the correction timeline over live SSE and replay via `ApiBlueprint`/`PageBlueprint`, and labels preview as non-writing; Playwright verifies preview and rejection paths on fixtures.
- No output surface (SSE, artifacts, logs, tests) contains secrets, credentialed blueprint URLs, uncited values, or IaC generated outside an approved blueprint.

## Frontend Completed

Implemented the contract-matched preview frontend at:

`/home/kevin/Repos/backstage/ai-crew-suite/plugins/frontend/plugin-ai-agent-frontend-scaffolder-ai-infra`

### Implemented surface

- Package `@ai-crew-suite/plugin-agent-scaffolder-infra` with
  legacy and `./alpha` entrypoints; standalone `/scaffolder-ai-infra` page with
  `?run=<id>` replay.
- Typed preview/replay client for `scaffolder-ai-infra` AI Core runs.
- `useInfraRun` reducer/hook, provider/service/region preview dialog, status
  banner, generated-file metadata manifest, validation findings, correction
  count, limitations, and retained evidence.
- The preview page explicitly states that it is non-writing and cannot provision
  infrastructure or write a Scaffolder workspace.

### Contract limitation (not fabricated)

The implemented preview runner emits only `infra-generation-report` metadata.
No generated file contents and no report-list endpoint are persisted, so this
frontend intentionally does not invent syntax-highlighted content tabs or a
history/list API. File writes remain exclusive to the real
`ai:infra:generate` Scaffolder action.

## Backend Completed

### Implemented

- Two real backend modules:
  - AI Core `scaffolder-ai-infra` preview runner (`scaffolder-infra` workflow)
  - Scaffolder `ai:infra:generate` action module registered through the verified
    `scaffolderActionsExtensionPoint`
- Shared versioned request schema, capacity/region/service-name validation,
  config-declared approved blueprint source selection, deterministic provider
  route (`main.tf` for Terraform; `template.yaml` for CloudFormation), and
  placeholder-only rendering.
- Deterministic validation blocks unresolved holes, secret material, public
  ingress, and wildcard IAM before any workspace write.
- Sandboxed workspace writer: resolved path containment, traversal rejection,
  all-or-nothing validation-before-write, dry-run manifest output, overwrite
  refusal by default, and the installed Scaffolder SDK's actual
  `ctx.checkpoint({ key, fn })` contract.
- Persisted non-writing preview reports as `infra-generation-report` artifacts.

### Contract limitations (not fabricated)

This delivery uses deterministic approved-blueprint hole rendering; it does not
fabricate a model generation/correction loop. Catalog ownership/duplicate
adapters, policy-driver validation over generated files, repository-blueprint
reads, RAG, and a dedicated Scaffolder action test helper require additional
confirmed integrations and remain deferred. The preview runner never writes a
workspace; writes occur only within an actual sandboxed Scaffolder action.

### Wiring added

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`
