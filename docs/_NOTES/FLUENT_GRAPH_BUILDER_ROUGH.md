# Fluent Graph Builder

This is a fluent API for use in agentic plugins to build their workflow graphs. Developers are able to implement their user-facing plugins by declaring a type-safe **State Schema**, defining **Nodes** as clean functional steps, and wiring up **Transitions**.

Behind the scenes, the backend core plugin handles:

1. **Temporal Compliance:** Automatically splitting tool calls/external API calls into Temporal Activities while maintaining graph nodes as a single deterministic Workflow execution.
2. **Vercel AI SDK Bindings:** Implicitly handling streaming tokens, tool states, and structural model calls without requiring the developer to build raw `AgentEvent` envelopes.
3. **Backstage UI Interoperability:** Automatically emitting standard JSON events (`step`, `tool_call`, `artifact_created`, `done`) that a generic frontend component can interpret out-of-the-box.

## The Target API (What Third-Party Developers Will Write)

Here is how `AlertTunerGraph.ts` looks using the new idiomatic SDK:

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

// Typesafe schema tracking context across steps
const AlertTunerState = z.object({
  request: z.any(),
  window: z.any(),
  samples: z.array(z.any()).default([]),
  evidence: z.array(z.any()).default([]),
  score: z.any().optional(),
});

export const alertTunerWorkflow = createAgentWorkflow({
  id: 'alert-tuning-workflow',
  stateSchema: AlertTunerState,
  inputSchema: AlertTunerInputSchema,
})
  // Steps naturally execute in sequence order unless redirected
  .addStep('observe', async (state, ctx) => {
    const request = parseAlertTuningQuery(JSON.stringify(ctx.input), ctx.triggerType);
    const window = resolveWindow(request, ctx.config.now);

    // Core plugin wraps this under a resilient Temporal Activity
    const entries = await ctx.activities.readAlertHistory({ request, window });
    const samples = toFiringSamples(entries, window);

    return { request, window, samples, evidence: toFiringEvidence(samples) };
  })

  // Simple conditional choice that handles its own routing out-of-line
  .addChoice('checkEvidence', (state) => {
    if (state.samples.length < 3) {
      return 'insufficientEvidence'; // Routes to a specific terminal outcome
    }
    return 'analyze'; // Continues down the happy path
  })

  .addStep('analyze', async (state, ctx) => {
    return { score: scoreNoise(state.samples, ctx.config.noise) };
  })

  .addStep('correlate', async (state, ctx) => {
    const incidents = await ctx.tools.invoke(INCIDENT_LIST_TOOL_ID, {
      service: state.request.service,
    });
    const correlation = toSuppressionWindows(incidents.output);

    return {
      score: applySuppression(state.score, state.samples, correlation.windows),
      evidence: [...state.evidence, ...correlation.evidence],
    };
  })

  .addChoice('evaluateVerdict', (state) => {
    return state.score.verdict === 'noisy' ? 'locate' : 'completeWithoutAction';
  })

  .addStep('locate', async (state, ctx) => {
    // Blends Vercel AI SDK smoothly inside the step execution boundary
    const proposal = await ctx.ai.generateStructuredObject({
      schema: ProposalSchema,
      prompt: `Generate mitigation strategy for score: ${JSON.stringify(state.score)}`,
    });

    // Native architectural abstraction to pin data to the UI
    ctx.emitArtifact('tuning-proposal', proposal);
  })

  // Declarative terminal states replace "addEdge('node', 'END')"
  .setTerminalOutcome('insufficientEvidence', (state, ctx) => {
    ctx.emitArtifact('tuning-proposal', buildEmptyProposal(state, 'Insufficient evidence found.'));
  })
  .setTerminalOutcome('completeWithoutAction', (state, ctx) => {
    ctx.emitArtifact('tuning-proposal', buildEmptyProposal(state, 'Alert verified healthy. No action needed.'));
  });

```

## Behind the Scenes: The Core Architecture

To make this clean API operational, your core backend framework needs to handle the underlying state machine orchestration using standard design patterns.

### 1. The Fluent Builder Interface

Use a builder pattern class to capture state transitions and nodes before locking down the runtime execution configurations.

```typescript
import { z } from 'zod';

export type WorkflowStepHandler<TState, TInput> = (
  state: TState,
  ctx: any // Orchestrator context
) => Promise<Partial<TState> | void> | Partial<TState> | void;

export class WorkflowBuilder<TState extends z.ZodTypeAny, TInput extends z.ZodTypeAny> {
  private steps: string[] = [];
  private handlers = new Map<string, WorkflowStepHandler<z.infer<TState>, z.infer<TInput>>>();
  private choices = new Map<string, (state: z.infer<TState>, ctx: any) => string>();
  private outcomes = new Map<string, WorkflowStepHandler<z.infer<TState>, z.infer<TInput>>>();

  constructor(private meta: { id: string; stateSchema: TState; inputSchema: TInput }) {}

  /** Adds a standard processing block. Runs in linear sequence order unless bypassed by a choice. */
  public addStep(name: string, handler: WorkflowStepHandler<z.infer<TState>, z.infer<TInput>>) {
    this.steps.push(name);
    this.handlers.set(name, handler);
    return this;
  }

  /** Evaluates data state and redirects to another Step or a Terminal Outcome */
  public addChoice(name: string, router: (state: z.infer<TState>, ctx: any) => string) {
    this.steps.push(name);
    this.choices.set(name, router);
    return this;
  }

  /** Declares an explicit exit point for the workflow, running any final cleanup/reporting logic */
  public setTerminalOutcome(name: string, handler: WorkflowStepHandler<z.infer<TState>, z.infer<TInput>>) {
    this.outcomes.set(name, handler);
    return this;
  }

  public compile() {
    // The core plugin converts this straight into a deterministic Temporal state machine loop.
    // Next step resolution logic: 
    // - If normal step: find next index in `this.steps` array.
    // - If choice: evaluate router function to get string label destination.
    // - If outcome: execute outcome handler and close workflow.
  }
}

export function createAgentWorkflow<TState extends z.ZodTypeAny, TInput extends z.ZodTypeAny>(meta: {
  id: string;
  stateSchema: TState;
  inputSchema: TInput;
}) {
  return new WorkflowBuilder(meta);
}

```

### 2. Standardizing the Backstage Event Stream Protocol

To allow the Backstage Frontend UI plugin to render the agent's work dynamically in real time without custom code for every tool, the core runner intercepts the state changes and yields clean, schema-enforced events:

| Event Type           | Purpose                                                      | Payload Contains                                       |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------ |
| `agent:step_enter`   | Renders a glowing node state in the frontend DAG layout.     | `nodeName`, `timestamp`                                |
| `agent:tool_call`    | Renders an expandable log widget showing live execution status. | `toolId`, `arguments`, `status: 'running' | 'success'` |
| `agent:stream_chunk` | Bridges `ai.streamText` from Vercel AI SDK directly into UI cards. | `delta`, `textAccumulator`                             |
| `agent:artifact`     | Populates specialized tabs (e.g., Code Diff viewer, Tuning Proposal metrics). | `artifactId`, `type`, `payload`                        |

### 3. Rich User-Facing UI Events to Add

To make the UI feel reactive and fully alive while an LLM or multi-step service loop is executing, your event stream protocol should expand past basic execution logs.

These events can be streamed down an SSE (Server-Sent Events) or WebSocket connection directly to the generic Backstage frontend:

- **`agent:thought_progress`**: Captures internal chain-of-thought or reasoning tokens before a tool or code block executes. *UI Impact: Renders an active, live-typing "Agent Reasoning..." markdown block.*
- **`agent:human_in_the_loop_required`**: Emitted when a step pauses execution waiting for approval (e.g., executing the actual code/patch deployment). *UI Impact: Prompts the user with a stylized block modal displaying "Approve / Reject" action buttons.*
- **`agent:step_retry`**: Triggered when a step fails due to a network boundary glitch but Temporal is actively retrying it. *UI Impact: Shifts the current node color to amber and shows a countdown timer (e.g., "Retrying step in 4s... Attempt 2/5").*
- **`agent:state_delta`**: Emitted immediately upon any step completing its execution cycle. *UI Impact: Dynamically fills a side drawer component showing the active inspectable memory state of the agent in real time.*

## Integrations (Capabilities), Milestones (Checkpoints), Memories (Retrieval/Embeddings), and Approvals (Human-in-the-Loop)

### 1. The Extended Target API

This iteration introduces semantic methods like `.requireApproval()`, `.checkpoint()`, and semantic interaction shortcuts within the execution context (`ctx.capabilities`, `ctx.memory`).

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const incidentRemediationWorkflow = createAgentWorkflow({
  id: 'incident-remediation-workflow',
  stateSchema: RemediationState,
  inputSchema: RemediationInputSchema,
})
  // --- STEP 1: INITIAL OBSERVATION & MEMORY RETRIEVAL ---
  .addStep('gatherIncidentContext', async (state, ctx) => {
    // Standard localized capability group call (PagerDuty driver used under the hood)
    const alert = await ctx.capabilities.pagerduty.getAlert(ctx.input.alertId);

    // Semantic Vector DB query abstracting the retrieval-augmented framework away
    const similarIncidents = await ctx.memory.search({
      query: alert.summary,
      limit: 3,
      filter: { component: alert.serviceName }
    });

    return { alert, runbookHints: similarIncidents };
  })

  // --- STEP 2: MILESTONE / CHECKPOINT ---
  // Purely declarative. Developers don't handle state serialization.
  // Behind the scenes, this tells Temporal to emit a durable checkpoint state 
  // and logs a progress marker to the UI.
  .checkpoint('contextGathered')

  // --- STEP 3: PLATFORM CROSS-EXAMINATION ---
  .addStep('checkInfrastructure', async (state, ctx) => {
    // Internal Backstage capability mapping natively to Backstage plugins
    const k8sStatus = await ctx.capabilities.backstage.kubernetes.getClusterStatus({
      serviceId: state.alert.serviceName,
    });

    // Cross-platform driver example: Can seamlessly query GitHub
    const recentCommits = await ctx.capabilities.github.getRecentCommits({
      repo: state.alert.repoUrl,
      timeWindow: '2h',
    });

    return { clusterHealthy: k8sStatus.isHealthy, recentCommits };
  })

  // --- STEP 4: HUMAN-IN-THE-LOOP APPROVAL ---
  // Halts execution. Temporal sleeps natively. No developer logic needed to manage state.
  // Renders a rich UI schema on the Backstage frontend for user action.
  .requireApproval('verifyRemediationPlan', {
    prompt: 'Review the generated deployment patch before running the Backstage Scaffolder.',
    schema: z.object({
      applyPatch: z.boolean().describe('Check to confirm patch application'),
      targetEnvironment: z.enum(['staging', 'production']),
    }),
    onApprove: async (approvalData, state, ctx) => {
      // If approved, execution springs back to life here natively.
      // Triggering an internal backstage capability group (Scaffolder template)
      const executionResult = await ctx.capabilities.backstage.scaffolder.executeTemplate({
        templateRef: 'template:default/apply-hotfix',
        values: { 
          patch: state.generatedPatch, 
          env: approvalData.targetEnvironment 
        },
      });

      // Semantic Vector DB memory insertion: update embeddings with execution history
      await ctx.memory.remember({
        text: `Successfully resolved alert ${state.alert.id} using hotfix patch.`,
        metadata: { alertId: state.alert.id, patchId: executionResult.id }
      });
    },
    onReject: (state, ctx) => {
      // Routes automatically to a clean terminal outcome or standard step fallback
      return 'remediationAborted';
    }
  })

  .setTerminalOutcome('remediationAborted', (state, ctx) => {
    ctx.capabilities.pagerduty.addNote(state.alert.id, 'Remediation plan was rejected by developer.');
  });
```

### 2. New Fluent Methods Explained

To implement these features cleanly, we add these methods to the `WorkflowBuilder`:

```typescript
.checkpoint(name: string)
```

- **Why it's needed:** While Temporal automatically tracks state under the hood via event sourcing, developers often want to declare explicitly named business checkpoints.
- **What it does:** It creates a named marker in the event history. If something goes wrong later, the core plugin can automatically reset or display to the user exactly which high-level milestone the agent reached before breaking down. It translates directly to a visual flag in the Backstage UI.

```typescript
.requireApproval(name: string, config: ApprovalConfig)
```

- **Why it's needed:** Managing asynchronous human interaction normally requires writing specialized webhooks, wait loops, or state columns.
- **What it does:** It abstracts this entirely. Under the hood, your core framework emits a `agent:human_in_the_loop_required` event to Backstage, calls a Temporal `Workflow.sleep()` or yields a signal await loop, and pauses until the frontend sends a signed execution event back to the worker.

### 3. Exposing Capabilities and Retrieval in Context (`ctx`)

Inside your handler block, the `ctx` payload acts as an intuitive facade layer shielding developers from raw API clients, credentials, or vector math:

```typescript
export interface AgentContext<TInput> {
  input: TInput;

  // Clean, unified access points to the 8 3rd party drivers + 3 internal services
  capabilities: {
    github: GitHubCapabilityDriver;
    pagerduty: PagerDutyCapabilityDriver;
    backstage: {
      scaffolder: ScaffolderClient;
      kubernetes: KubernetesClient;
      techdocs: TechDocsClient;
    }
  };

  // The simplified Retrieval-Augmented Generation context
  memory: {
    /** Searches historical incident logs and architecture files via unified Vector DB embeddings */
    search: (opts: { query: string; limit?: number; filter?: Record<string, any> }) => Promise<any[]>;
    /** Converts the provided text string into vector embeddings and saves it down automatically */
    remember: (opts: { text: string; metadata?: Record<string, any> }) => Promise<void>;
  };
}
```

### 4. More Valuable UI Events for these Concepts

With these platform additions, your real-time UI streaming protocol can become even smarter:

- **`agent:capability_started` / `agent:capability_finished`**: Triggered whenever a third-party driver or internal Backstage capability executes. *UI Impact: Generates specialized, branded badges in the log stream (e.g., showing a GitHub icon loading indicator or a checkmark beside a K8s query).*
- **`agent:memory_retrieved`**: Triggered when a `.memory.search()` yields results. *UI Impact: Populates a "Related Context Documents" sidebar with links to Backstage TechDocs or past resolving incident runbooks.*
- **`agent:checkpoint_reached`**: Triggered when execution crosses a `.checkpoint()` declaration. *UI Impact: Marks a segment of the visual progress bar as permanently complete/saved, giving developers peace of mind during long-running tasks.*

## Implicit vs. Explicit Checkpoints

You should establish a system where checkpoints are automatically committed immediately following any **state-mutating external boundary operation**.

1. **Automated Checkpoints (Implicit):**
   - **After every `ctx.capabilities.\*` invocation:** Any action that reaches outside the workflow boundary (e.g., creating a GitHub PR, running a Scaffolder template, paging an on-call engineer) automatically generates a checkpoint. If an infrastructure outage occurs immediately after, the platform knows exactly what side effects have already been committed.
   - **After an explicit user approval returns:** The moment a user hits "Approve" on the Backstage frontend and execution resumes, a checkpoint is instantly created.
   - **Upon step resolution:** The moment an `.addStep()` block cleanly completes and returns a modified state object, the platform snapshots the updated state schema.
2. **Developer Checkpoints (Explicit via `.checkpoint('name')`):**
   - Reserved for naming logical milestones in business logic (e.g., `contextGathered`, `triageComplete`) that group multiple small steps together for the UI.

### How the Fluent Runner Implements Automated Checkpoints

To achieve this without forcing developers to write extra code, your core framework wraps the execution of handlers and capabilities in a proxy layout.

Here is an architectural view of how the platform executor intercepts execution under the hood within the Temporal workflow loop:

```typescript
// Inside your Core Plugin's Temporal Workflow Executor
export async function runAgentWorkflow(compiledWorkflow: CompiledWorkflow, workflowInput: any) {
  let currentState = compiledWorkflow.initialState;

  for (const step of compiledWorkflow.steps) {
    // 1. Emit UI Step Transition Event
    emitWorkflowEvent('agent:step_enter', { stepName: step.name });

    // 2. Build a proxy context that automatically intercepts actions
    const ctx = createInterceptedContext(workflowInput, {
      onCapabilityExecuted: async (capabilityName, action, result) => {
        // AUTOMATED CHECKPOINT: Triggered behind the scenes for every capability call
        await emitWorkflowEvent('agent:checkpoint_reached', {
          type: 'automatic',
          trigger: `capability:${capabilityName}.${action}`,
          stateSnapshot: currentState,
        });
      }
    });

    try {
      // 3. Execute the developer's step code
      const stateDelta = await step.handler(currentState, ctx);
      currentState = { ...currentState, ...stateDelta };

      // AUTOMATED CHECKPOINT: Step execution completed successfully
      await emitWorkflowEvent('agent:checkpoint_reached', {
        type: 'automatic',
        trigger: `step_completion:${step.name}`,
        stateSnapshot: currentState,
      });

    } catch (error) {
      emitWorkflowEvent('agent:step_failed', { stepName: step.name, error });
      throw error;
    }
  }
}
```

### What this unlocks for the Backstage Developer Experience

By making checkpoints native and automatic, your core Backstage plugin provides features that feel magical to third-party developers:

- **Auto-Resume & Fault Isolation:** If a backend node crashes mid-workflow, the Backstage frontend doesn't display a generic "500 Internal Server Error." Instead, the UI reads the last automated checkpoint event and displays: *"Execution paused. Resume available from checkpoint: Post-Kubernetes-Cluster-Check."*
- **Time-Travel Debugging for Developers:** During local plugin development, developers can view an inspectable timeline in their Backstage view. They can click on any historical automated checkpoint to inspect the exactly serialized `stateSchema` variables at that precise split-second in time.
- **Reduced UI Event Noise:** While the platform creates checkpoints for every capability call, your framework can group them under the parent Step in the UI. The user sees a clean, macro progress bar, but expanding a step reveals the automated micro-checkpoints underneath.

## **RBAC permissions, structured logging, and OpenTelemetry tracing** directly into the fluent workflow primitives

This iteration adds declarative step-level permission guards, semantic contextual logging, and explicit telemetry instrumentation blocks.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const clusterPatchWorkflow = createAgentWorkflow({
  id: 'cluster-patch-workflow',
  stateSchema: PatchState,
  inputSchema: PatchInputSchema,
})
  // --- STEP 1: INITIAL RECONCILIATION ---
  .addStep('evaluateInfrastructure', async (state, ctx) => {
    // 1. Contextual Logging (Highly structured, automatically adds runId, agentId, and workflow step context)
    ctx.logger.info('Analyzing cluster status before executing scaffolding operations', {
      clusterId: ctx.input.targetCluster,
    });

    const k8sStatus = await ctx.capabilities.backstage.kubernetes.getClusterStatus({
      serviceId: ctx.input.serviceId,
    });

    return { isHealthy: k8sStatus.isHealthy };
  })

  // --- STEP 2: DECLARATIVE PERMISSION GUARD ---
  // If the user initiating the workflow fails this check via the Backstage RBAC service,
  // the workflow aborts instantly *before* hitting the step, saving compute/token costs.
  .addStep('executeClusterRollout', async (state, ctx) => {

    // 2. OpenTelemetry Tracing: Wrap sensitive or heavy compute blocks in a sub-span
    const catalogData = await ctx.telemetry.trace('fetch-catalog-metadata', async (span) => {
      span.setAttribute('service.id', ctx.input.serviceId);

      const component = await ctx.capabilities.backstage.catalog.getEntityByRef(ctx.input.serviceId);

      span.addEvent('catalog_metadata_resolved');
      return component;
    });

    const execution = await ctx.capabilities.backstage.scaffolder.executeTemplate({
      templateRef: 'template:default/k8s-hotfix',
      values: { target: ctx.input.targetCluster, metadata: catalogData },
    });

    return { rolloutId: execution.id };
  }, {
    // Elegant step options injecting native Backstage authorization rules
    authorize: {
      permission: catalogEntityModifyPermission, 
      // Resolves attributes dynamically using the execution context
      getAttributes: (ctx) => ({ entityRef: ctx.input.serviceId }),
    }
  });
```

### 2. Deep Dive: Architectural Implementations

#### A. RBAC & Permissions Checking (`authorize` configuration)

By moving the authorization check to the step configuration block instead of handling it inside the handler function, the core plugin can intercept the execution inside the Temporal worker.

When the workflow kicks off or resumes a step, the core plugin coordinates with the Backstage `PermissionEvaluator`. If the initiating user lacks the required rule clearance, the core engine blocks execution and automatically emits an `agent:permission_denied` event down the stream to the UI.

#### B. Context-Aware Structured Logging (`ctx.logger`)

Instead of a raw `console.log` or a global logger instance, the context object receives a *curried platform logger*. Every log line emitted by `ctx.logger.info()` or `ctx.logger.error()` automatically appends:

- `workflowId` and `runId`
- The current execution `stepName`
- The active `userId` or `userRef` invoking the plugin

This ensures that your central logging system (Elastic, Datadog, etc.) can perfectly correlate agent actions with specific user requests without the developer typing out boilerplate metadata tags.

#### C. Trace Spans (`ctx.telemetry.trace`)

Your core engine should automatically wrap *every step* inside a parent OpenTelemetry (OTel) span. However, providing `ctx.telemetry.trace()` allows developers to spin up child spans for intense internal subprocesses—like large Vector DB lookups or massive text token parsing blocks. This gives platform engineers granular execution flame graphs showing exactly where an agent is hanging or spending money.

### 3. Finalized Core Context Schema (`ctx`)

Here is what the complete execution context interface looks like for a third-party developer consuming your core plugin:

```typescript
import { LoggerService } from '@backstage/backend-plugin-api';

export interface AgentContext<TInput> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';
  userRef: string; // The fully resolved Backstage entity string of the active user

  // High-value framework blocks
  capabilities: ...;
  memory: ...;

  // 1. Contextual, structured logging interface matching Backstage standards
  logger: LoggerService;

  // 2. OpenTelemetry wrapper for performance profiling and observability
  telemetry: {
    trace: <T>(name: string, fn: (span: any) => Promise<T>) => Promise<T>;
  };
}
```

### 4. Enterprise UI & Auditing Events

Adding these paradigms introduces three critical security and diagnostic events to your real-time protocol:

- **`agent:permission_denied`**: Emitted when a step's declarative permission check fails. *UI Impact: Immediately halts execution, shifting the active card to a secure red state displaying: "Unauthorized Action: You do not possess the required RBAC roles to execute this deployment."*
- **`agent:trace_span_started` / `agent:trace_span_ended`**: Emitted when explicit code tracing is active. *UI Impact: Feeds live performance telemetry dashboards or rendering sync animations for long calculations.*
- **`agent:audit_log_committed`**: Triggered when a mutating step finishes. *UI Impact: Pushes a tamper-proof event trace to your Backstage internal auditor trail showing exactly who authorized the agent to act on their behalf.*

## Compliance-Enforced Target API

This iteration adds tenant-isolation contexts, declarative PHI/PII data scrubbing filters, and regulatory audit retention marks directly into the workflow signature.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const medicalBillAuditWorkflow = createAgentWorkflow({
  id: 'medical-bill-audit-workflow',
  stateSchema: AuditState,
  inputSchema: AuditInputSchema,
})
  // --- PLATFORM COMPLIANCE ENFORCEMENT ---
  .configureCompliance({
    // Hard multi-tenancy isolation boundary
    tenantIsolation: 'strict-logical', 
    // HIPAA/SOC-2 requirement: Automatically scrub data before it hits external LLMs
    dataRedaction: {
      enabled: true,
      rules: ['HIPAA_PHI', 'US_SSN', 'CREDIT_CARD'],
    },
    // FINRA requirement: Lock down immutable retention periods for this workflow type
    retention: {
      duration: '7-years',
      classification: 'REGULATORY_AUDIT',
    }
  })

  // --- STEP 1: PATIENT RECORD TRIAGE ---
  .addStep('fetchPatientContext', async (state, ctx) => {
    // 1. Tenant Verification Guard: The platform context automatically scoping queries
    ctx.logger.info(`Fetching record inside isolated tenant vault: ${ctx.tenant.id}`);

    // Internal capability automatically applies tenant filtering under the hood
    const healthRecord = await ctx.capabilities.backstage.healthVault.getRecord({
      recordId: ctx.input.recordId
    });

    return { rawRecordData: healthRecord };
  })

  // --- STEP 2: LLM ANALYSIS WITH AUTO-REDACTION ---
  .addStep('analyzeBillingAnomalies', async (state, ctx) => {
    // 2. Data Masking Facade: Any payload passed to the AI SDK is automatically passed through 
    // the platform's local tokenization proxy *before* hitting the external LLM provider.
    const findings = await ctx.ai.generateStructuredObject({
      schema: BillingAnalysisSchema,
      prompt: `Analyze the following billing notes for discrepancies: ${state.rawRecordData.notes}`,
    });

    // The result from the LLM is automatically detokenized back into the secure runtime
    return { auditFindings: findings };
  })

  // --- STEP 3: COMPLIANCE IMMUTABLE LOG ---
  .addStep('finalizeAuditReport', async (state, ctx) => {
    // 3. Declarative Compliance Attestation: Enforces a tamper-proof sign-off in the audit trail
    ctx.compliance.attest({
      action: 'WORKFLOW_FINALIZE',
      reasoning: 'Automated policy reconciliation achieved with 98% confidence.',
      evidenceRefs: [state.auditFindings.documentHash],
    });

    // Generate physical artifact for the Backstage compliance tab
    ctx.emitArtifact('compliance-report', state.auditFindings);
  });
```

### 2. Deep Dive: New Compliance Primitives & Fluent Methods

#### A. `.configureCompliance(config: ComplianceConfig)`

Instead of leaving compliance up to individual developer implementations, this top-level configuration forces workflows to register their regulatory operational boundaries.

- **`tenantIsolation`**: Instructs the core plugin engine to validate that the `ctx.tenant.id` matches the data partition being accessed across every capability group (e.g., ensuring a GitHub driver doesn't inadvertently query an organization belonging to another tenant).
- **`dataRedaction`**: Ties directly into the **Vercel AI SDK** pipeline wrapper. Before any prompt string or system message is dispatched to an AI model endpoint, it passes through a high-performance local regex/NER (Named Entity Recognition) scrubber to swap sensitive elements (like names, phone numbers, and patient IDs) with secure placeholder tokens (`[REDACTED_PHI_01]`). The model responds using these tokens, and the framework swaps the real data back in once inside your secure enterprise network perimeter.
- **`retention`**: Dictates the lifecycle of the **Temporal execution history**. For standard workflows, logs might be deleted after 30 days. For FINRA compliance, history payloads must be archived to immutable WORM (Write Once, Read Many) cold storage (like AWS S3 with Object Lock enabled).

#### B. Contextual Compliance Attestation (`ctx.compliance.attest`)

This replaces generic application logging. An attestation logs a strictly structured JSON envelope directly to a designated, write-segregated audit trail database. It bridges the human or machine decision to an explicit regulatory obligation.

```typescript
export interface ComplianceContext {
  /** Commits a cryptographically checkable audit event mapping strictly to SOC-2 / FINRA specifications */
  attest: (opts: {
    action: string;
    reasoning: string;
    evidenceRefs: string[];
  }) => void;
}
```

### 3. Critical Compliance UI & Administrative Events

Operating in highly regulated environments requires specialized, real-time security events to alert administrators and auditors:

- **`agent:data_scrubbed`**: Emitted whenever the platform tokenization proxy strips PII/PHI out of a text stream before it goes to an external AI vendor. *UI Impact: Renders a protective visual shield indicator over the logs showing: "Security Alert: 3 PHI elements automatically masked before processing."*
- **`agent:tenant_mismatch_detected`**: Triggered if a step attempts to interact with an external resource whose tenant ID does not match the active session workflow token. *UI Impact: Immediately terminates the entire execution thread, locks out the interface, and dispatches a high-priority webhook notification to the corporate SecOps monitoring team.*
- **`agent:attestation_signed`**: Emitted when a `.attest()` invocation completes. *UI Impact: Places an immutable digital seal badge on the workflow execution history panel within the Backstage frontend.*

## Multi-Agent & Cyclic Target API

This example showcases a **Self-Correcting Code Generation Workflow** where a primary agent generates code, loops through a compiler check until it passes, and delegates to a secondary security specialist agent if it detects an enterprise risk.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { securityReviewerWorkflow } from './securityReviewerWorkflow';
import { z } from 'zod';

export const smartScaffolderWorkflow = createAgentWorkflow({
  id: 'smart-scaffolder-workflow',
  stateSchema: DeveloperState,
  inputSchema: DeveloperInputSchema,
})
  // --- STEP 1: INITIAL GENERATION ---
  .addStep('generateCode', async (state, ctx) => {
    const code = await ctx.ai.generateText({
      prompt: `Write a robust TypeScript plugin for Backstage based on: ${ctx.input.description}`,
    });
    return { generatedCode: code, retryCount: 0 };
  })

  // --- CYCLIC WORKFLOW: ITERATIVE REFINEMENT LOOP ---
  // Simple business concept: Repeat these steps until the condition returns true
  .repeatUntil('compileAndFixCode', {
    // The breaking condition (like a while loop guard)
    condition: (state) => state.compilationPassed === true || state.retryCount >= 3,

    // The ordered sequence of actions executed inside the loop
    pipeline: (loop) => loop
      .addStep('verifyCompilation', async (state, ctx) => {
        const result = await ctx.capabilities.backstage.compiler.runCheck(state.generatedCode);
        return { compilationPassed: result.success, compileErrors: result.errors };
      })
      .addStep('selfCorrect', async (state, ctx) => {
        // If it passed, the loop breaks before running this step because of the condition guard
        if (state.compilationPassed) return {};

        const fixedCode = await ctx.ai.generateText({
          prompt: `Fix this code based on these compilation errors: ${state.compileErrors}\nCode:\n${state.generatedCode}`,
        });
        return { generatedCode: fixedCode, retryCount: state.retryCount + 1 };
      })
  })

  // --- STEP 2: POST-LOOP ROUTING CHOICE ---
  .addChoice('evaluateCompilationStatus', (state) => {
    if (!state.compilationPassed) return 'failedCompilationOutcome';
    return 'checkSecurityBoundaries';
  })

  // --- MULTI-AGENT WORKFLOW: DELEGATION HANDOFF ---
  // Routes to a completely separate agent workflow instance
  // The core plugin handles passing the multi-tenant credentials, RBAC context, and span traces across agents
  .addStep('checkSecurityBoundaries', async (state, ctx) => {
    ctx.logger.info('Delegating code payload to the specialized Security Reviewer Agent.');

    // 1. Natively delegate execution to a sub-agent workflow. 
    // This is executed as a child Temporal workflow execution.
    const securityResult = await ctx.delegateTo(securityReviewerWorkflow, {
      codeSnippet: state.generatedCode,
      complianceRules: ['SOC-2', 'FINRA'],
    });

    return { securityScore: securityResult.score, securityVulnerabilities: securityResult.issues };
  })

  // --- STEP 3: FINAL DECISION ---
  .addChoice('processSecurityFeedback', (state) => {
    return state.securityScore >= 90 ? 'deployCode' : 'requireManualAudit';
  })

  .addStep('deployCode', async (state, ctx) => {
    await ctx.capabilities.github.createPullRequest({
      title: 'Automated Backstage Plugin Generation',
      body: state.generatedCode,
    });
  })

  // --- TERMINAL OUTCOMES ---
  .setTerminalOutcome('failedCompilationOutcome', (state, ctx) => {
    ctx.logger.error('Agent failed to compile the generated plugin after 3 iterations.');
  })
  .setTerminalOutcome('requireManualAudit', (state, ctx) => {
    ctx.emitArtifact('security-violations-report', state.securityVulnerabilities);
  });
```

### 2. New Fluent Methods Explained

To provide this functionality without degrading back-end determinism, the `WorkflowBuilder` implements two new constructs:

```typescript
.repeatUntil(name: string, loopConfig: LoopConfig)
```

- **Why it's needed:** In standard graphs, loops require creating explicit edge cycles back to a previous node. Developers frequently miswire this or create infinite loops that deplete system resources.
- **What it does:** It creates an isolated, nested execution loop block. The builder registers the `pipeline` as a sub-sequence. The underlying engine executes the inner steps sequentially, hits the bottom, checks the `condition` logic, and automatically rewinds execution back to the first step of the pipeline if the condition evaluates to `false`.

```typescript
ctx.delegateTo(subWorkflow, inputPayload)
```

- **Why it's needed:** Modern agentic architectures rely on specialized teams of agents rather than one single monolithic prompt.
- **What it does:** Rather than building a top-level fluent configuration mapping every single sub-agent node, developers simply instantiate standalone workflows. The parent context provides a type-safe `.delegateTo()` method. Behind the scenes, the core plugin maps this to a **Temporal Child Workflow**. The parent workflow goes to sleep while the child workflow spawns its own step loops, automated checkpoints, and isolated capability hooks.

### 3. Multi-Agent & Cyclic UI Streams

These structural loops and sub-agent handoffs require clear real-time indicators on the Backstage dashboard so developers don't feel like the system is hanging:

- **`agent:loop_iteration_started` / `agent:loop_iteration_ended`**: Emitted on every turn of a `.repeatUntil` block. *UI Impact: Renders a looping rotary animation around the active step block, displaying an incrementing iteration counter (e.g., "Compiling and Self-Correcting: Attempt 2 of 3").*
- **`agent:delegation_initiated`**: Emitted when `ctx.delegateTo()` kicks off. *UI Impact: The UI smoothly expands the main agent view down or into a side pane, sliding in a brand-new sub-agent dashboard lifecycle showing: "Delegating task to SecurityReviewerAgent..."*
- **`agent:delegation_completed`**: Triggered when the sub-agent terminates. *UI Impact: Collapses the sub-agent pane and returns focus to the main workflow track, animating the data payload moving back into primary memory.*

## **Resilience Profiles (Error Recovery)** and **Declarative Human Interaction (Inputs/Signals)**

These features tackle the hidden complexities of distributed agentic systems—specifically, handling unreliable third-party platforms and managing user input midway through a long-running workflow.

### 1. The Production-Ready, Feature-Complete API

This seventh and final iteration adds explicit inline retry overrides, interactive user question blocks, and dynamic context hydration.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const comprehensiveClusterOps = createAgentWorkflow({
  id: 'cluster-operations-workflow',
  stateSchema: ClusterState,
  inputSchema: ClusterInputSchema,
})
  // --- ADVANCED RESILIENCE SETTINGS ---
  .configureResilience({
    // Standardizing enterprise fallback strategies across all steps
    defaultRetryPolicy: {
      initialIntervalSeconds: 5,
      backoffCoefficient: 2,
      maximumAttempts: 5,
    },
    // Safe Circuit Breaking: Prevent overloading flaky internal platforms
    circuitBreakers: { 'backstage:kubernetes': { maxFailures: 3, resetTimeoutMinutes: 5 } }
  })

  // --- STEP 1: INTERACTIVE WORKFLOW HYDRATION ---
  // Mid-workflow data requests. If the agent notices missing input mid-flight, 
  // it actively interviews the user rather than failing.
  .addStep('validateTargetEnvironment', async (state, ctx) => {
    if (ctx.input.targetCluster) return { env: ctx.input.targetCluster };

    // The agent halts, sleeps inside Temporal, and prompts the user on the Backstage UI
    const answer = await ctx.interaction.askUser({
      title: 'Select Destination Cluster',
      prompt: 'Multiple target clusters were discovered for this service. Please select one.',
      schema: z.object({
        selectedEnv: z.enum(['us-east-prod', 'eu-west-prod', 'staging'])
      })
    });

    return { env: answer.selectedEnv };
  })

  // --- STEP 2: RESILIENT STEP CAPABILITY EXECUTION ---
  .addStep('applyClusterConfigurations', async (state, ctx) => {
    ctx.logger.info(`Applying manifest rollout configurations to ${state.env}`);

    // High reliability wrapper bypassing the default policy for risky changes
    const deployResult = await ctx.resilience.runWithRetry(
      async () => {
        return await ctx.capabilities.backstage.kubernetes.deployManifest({
          cluster: state.env,
          manifestPath: './k8s/deployment.yaml'
        });
      },
      { maximumAttempts: 10, nonRetryableErrors: ['INVALID_MANIFEST_SYNTAX'] }
    );

    return { rolloutStatus: deployResult.status };
  })

  // --- STEP 3: ASYNCHRONOUS BACKGROUND EVENT WAITING ---
  // The workflow pauses here until an external platform sends a signal (webhook/event) back
  .waitForSignal('k8s-rollout-complete', {
    timeout: '30-minutes',
    matchCondition: (signalPayload, state) => signalPayload.cluster === state.env,
    onSuccess: async (signalPayload, state, ctx) => {
      ctx.logger.info('Received healthy cluster readiness probe signal from Kubernetes.');
      return { deploymentHealthy: true };
    },
    onTimeout: async (state, ctx) => {
      // Automatic compensation logic if the background operation hangs
      ctx.logger.error('Rollout timed out. Initiating automated graceful rollback sequence.');
      await ctx.capabilities.backstage.kubernetes.rollback({ cluster: state.env });
      return 'failedRolloutOutcome';
    }
  });
```

### 2. The Final Set of Fluent Methods

To support these robust systems, we append these three final concepts to our framework blueprint:

```typescript
ctx.interaction.askUser(options)
```

- **Why it's needed:** Multi-step workflows frequently hit branch points where an LLM shouldn't guess, or where missing operational data must be provided by a human operator.
- **What it does:** Similar to `.requireApproval()`, this blocks execution and goes to sleep inside a **Temporal Workflow Signal listener**. However, instead of a binary "Yes/No" approval button, it projects a dynamic, schema-driven Form onto the Backstage frontend plugin, allowing the user to provide structured data before waking the agent back up.

```typescript
.waitForSignal(name, options)
```

- **Why it's needed:** Cloud operations are rarely instantaneous. Running a deployment means waiting for an asynchronous callback or health check from systems like ArgoCD, GitHub Actions, or AWS CloudWatch.
- **What it does:** Leverages **Temporal Signals**. It parks the agent safely in the cloud until a corresponding event hits the Backstage backend router hook. The workflow sets a hard timeout boundary; if the event never arrives, it executes automatic rollback or cleanup handlers before cleanly terminating.

```typescript
ctx.resilience.runWithRetry(fn, options)
```

- **Why it's needed:** Third-party developer tools fail all the time due to transient network drops, rate limits, or platform maintenance.
- **What it does:** It allows developers to specify isolated error management per code block. If the inner function drops, the platform catches the exception, evaluates if it's transient, computes exponential backoffs, and retries the exact execution frame seamlessly.

### 3. Ultimate UI Dashboard & Audit Events

To cleanly close out the frontend plugin contracts, we introduce the final interaction stream types:

- **`agent:user_prompt_displayed`**: Triggered when a step demands active interactive inputs via `askUser`. *UI Impact: Populates a highly interactive form input dialogue card directly in the developer's Backstage feed.*
- **`agent:waiting_for_signal`**: Emitted when the agent pauses for background event triggers. *UI Impact: Switches the node status into a passive "Listening for External Status Hook..." pulse state with an active countdown timer reflecting the timeout window.*
- **`agent:circuit_breaker_tripped`**: Emitted when a specific platform capability is automatically blocked by the core manager due to persistent downstream errors. *UI Impact: Flags the capability badge red with a warning icon: "Direct integration calls to PagerDuty temporarily paused by platform safety circuit breaker."*

## **type safety propagation** and **deterministic localized utility management**

In your current design, as the workflow grows, passing types between steps or manually injecting options into helpers becomes messy. We can refactor the setup so the Zod `stateSchema` and `inputSchema` **automatically type-infer the entire developer experience** from step to step, and introduce a concept of **Scoped Local Helpers** (like your `parseAlertTuningQuery` and `scoreNoise`) so they are seamlessly testable and observable.

### 1. The Ultimate Typings & Scoped Helper Architecture

This final evolution turns your utility functions into context-aware helpers that automatically emit trace spans and logging telemetry without extra code, while the entire pipeline retains 100% strict type safety.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

// Explicit Input & State definitions
const AlertTunerInput = z.object({
  alertId: z.string(),
  service: z.string(),
});

const AlertTunerState = z.object({
  request: z.any(),
  window: z.any(),
  samples: z.array(z.any()).default([]),
  evidence: z.array(z.any()).default([]),
  score: z.object({ verdict: z.string() }).optional(),
});

export const alertTunerWorkflow = createAgentWorkflow({
  id: 'alert-tuning-workflow',
  stateSchema: AlertTunerState,
  inputSchema: AlertTunerInput,
})
  // --- DEFINE INJECTED CONFIG / CAPABILITY PLUGINS ---
  // Explicitly binds domain helpers, mapping them directly to the context execution boundary
  .useHelpers({
    parseQuery: (ctx, rawInput: string) => parseAlertTuningQuery(rawInput, ctx.triggerType),
    scoreNoise: (ctx, samples: any[]) => scoreNoise(samples, ctx.config.noise),
  })

  // --- STEP 1: INITIAL DATA INGESTION ---
  // The 'state' and 'ctx' variables below are fully inferred. 
  // Typing 'ctx.input.' will autocomplete 'alertId' and 'service'.
  .addStep('observe', async (state, ctx) => {
    // Curried helpers automatically receive ctx, making them trace-aware and secure
    const request = ctx.helpers.parseQuery(JSON.stringify(ctx.input));
    const window = resolveWindow(request, ctx.config.now);

    const entries = await ctx.activities.readAlertHistory({ request, window });
    const samples = toFiringSamples(entries, window);

    // Type-safe return: compiler ensures keys match the properties in AlertTunerState
    return {
      request,
      window,
      samples,
      evidence: toFiringEvidence(samples),
    };
  })

  // --- STEP 2: PIPELINE CONDITION ---
  // 'state.samples' is perfectly inferred as an array from the parent schema definitions
  .addChoice('checkEvidence', (state) => {
    return state.samples.length < 3 ? 'insufficientEvidence' : 'analyze';
  })

  // --- STEP 3: ANALYZE ---
  .addStep('analyze', async (state, ctx) => {
    // Scoped helper automatically inherits OTel sub-spans under the hood
    const baseScore = ctx.helpers.scoreNoise(state.samples);
    return { score: baseScore };
  });
```

### 2. Under the Hood: The Masterclass TypeScript Types

To achieve this fluid type safety across multiple chained methods, your `WorkflowBuilder` uses TypeScript generic parameters that shift and accumulate states as developers build the workflow:

```typescript
import { z } from 'zod';

export class WorkflowBuilder<
  TState extends z.ZodTypeAny,
  TInput extends z.ZodTypeAny,
  THelpers extends Record<string, (ctx: any, ...args: any[]) => any> = {}
> {
  constructor(private meta: { id: string; stateSchema: TState; inputSchema: TInput }) {}

  /** Binds business utilities to the execution pipeline context */
  public useHelpers<TNewHelpers extends Record<string, (ctx: any, ...args: any[]) => any>>(
    helpers: TNewHelpers
  ): WorkflowBuilder<TState, TInput, TNewHelpers> {
    // Store helpers locally and pass type parameters forward
    return this as any;
  }

  /** Adds a step where state input and returned delta are type-inferred against the Zod schema */
  public addStep(
    name: string,
    handler: (
      state: z.infer<TState>,
      ctx: AgentContext<z.infer<TInput>, THelpers>
    ) => Promise<Partial<z.infer<TState>> | void> | Partial<z.infer<TState>> | void
  ): this {
    // Core engine registration logic...
    return this;
  }

  /** Conditional branching router with type safety over active state profiles */
  public addChoice(
    name: string,
    router: (state: z.infer<TState>, ctx: AgentContext<z.infer<TInput>, THelpers>) => string
  ): this {
    return this;
  }
}

// Intercepted execution context interface definition
export interface AgentContext<TInput, THelpers> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';

  // Unwraps curried helper parameters: hides the initial 'ctx' parameter from the developer!
  helpers: {
    [K in keyof THelpers]: THelpers[K] extends (ctx: any, ...args: infer A) => infer R
      ? (...args: A) => R
      : never;
  };

  // Base platform services
  capabilities: any;
  memory: any;
  logger: any;
}
```

Why this final iteration completes the developer experience

1. **Hidden Context Parameterization (`ctx.helpers`):** When developers register a utility via `.useHelpers`, the utility signature requires `ctx` as the first argument so it can log or read configs. However, the generic types strip `ctx` out inside the step block. The developer just types `ctx.helpers.scoreNoise(samples)` naturally.
2. **Elimination of Typos:** Third-party developers cannot return arbitrary typos like `{ scoree: baseScore }`. The TypeScript compiler flags it immediately because it maps directly to `Partial<z.infer<TState>>`.
3. **Seamless Refactoring:** If the state schema changes, the TypeScript compiler automatically highlights every single step handler, loop condition, and choice across the backend codebase that is now broken.

## **Dynamic Parallel Execution (Fan-Out/Fan-In)**, **State Reductions (Undo/Rollback Actions)**, and **Streaming Callbacks for LLM Text (Vercel AI SDK Integration)**

When agents need to scan 10 repositories simultaneously, handle failures mid-execution gracefully, or stream a markdown text field directly to the user's screen, standard linear pipelines break.

Here is the ultimate extension to the fluent builder to cleanly wrap these advanced runtime primitives.

### 1. The Definitive Multi-Agent, Parallel, and Streaming API

This example showcases a **Massive Triage Agent** that operates on multiple targets in parallel, handles rollbacks dynamically if an action fails, and streams live text generation using the Vercel AI SDK.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const massiveTriageWorkflow = createAgentWorkflow({
  id: 'massive-triage-workflow',
  stateSchema: TriageState,
  inputSchema: TriageInputSchema,
})
  // --- ADVANCED FEATURE 1: DYNAMIC PARALLEL FAN-OUT ---
  // Loops through a state array and forks isolated parallel execution threads.
  // Behind the scenes, the core plugin maps this directly to Temporal's Promise.all() activity split.
  .addParallelForEach('triageRepositories', {
    // Defines what array in the state schema to iterate over
    iterator: (state) => state.targetRepos,
    // The parallel execution block executed for each item concurrently
    pipeline: (fork) => fork
      .addStep('checkRepoSecurity', async (repo, state, ctx) => {
        // Runs concurrently across all repositories
        const status = await ctx.capabilities.github.getRepositoryScan({ repoName: repo.name });
        // Returns a partial state that will be collected into a structural array reduction
        return { repoName: repo.name, vulnerabilitiesFound: status.count };
      })
  })

  // --- ADVANCED FEATURE 2: STREAMING TEXT GENERATION ---
  // Seamless integration with Vercel AI SDK text streaming. 
  // Automatically handles routing token chunks straight down the SSE connection to the Backstage UI.
  .addStreamingStep('generateExecutiveSummary', async (state, ctx) => {
    // The framework intercepts this text stream and handles the raw 'agent:stream_chunk' events
    await ctx.ai.streamText({
      prompt: `Summarize the security vulnerabilities found across our fleet: ${JSON.stringify(state.triageResults)}`,
      onChunk: (chunk) => {
        // Optional interceptor hook if the developer needs to monitor or redact text on the fly
        ctx.logger.debug(`Streaming chunk: ${chunk}`);
      }
    });

    // When the stream finishes, returning a payload updates the permanent workflow state memory frame
    return { summaryStatus: 'COMPLETED' };
  })

  // --- ADVANCED FEATURE 3: COMPENSATING ACTIONS / REGULATORY UNDO ---
  // Ties a permanent rollback function to a specific action. 
  // If the workflow crashes or gets cancelled later, Temporal automatically replays this stack in reverse.
  .addStep('isolateCompromisedInfrastructure', async (state, ctx) => {
    const isolationId = await ctx.capabilities.backstage.kubernetes.quarantineNamespace({
      namespace: state.vulnerableNamespace
    });

    return { isolationId };
  }, {
    // Declarative compensation logic for disaster recovery/compliance
    onRollback: async (state, ctx) => {
      ctx.logger.warn('Workflow failure triggered. Reversing structural quarantine on namespace.');
      await ctx.capabilities.backstage.kubernetes.liftQuarantine({ namespace: state.vulnerableNamespace });
    }
  });
```

### 2. New Fluent Methods Breakdown

To make these capabilities intuitive for standard developers, the `WorkflowBuilder` incorporates these three advanced engine hooks:

```typescript
.addParallelForEach(name, config)
```

- **Why it's needed:** Running a loop sequentially for 20 microservices takes forever. Doing manual multi-threading or async execution in an agent breaks Temporal's determinism constraints.
- **What it does:** It creates a thread manager. It spawns independent parallel pipelines execution scopes. The state returned by the inner handlers is automatically accumulated into a clean, type-safe array inside the parent workflow state frame upon completion of all forks.

```typescript
.addStreamingStep(name, handler)
```

- **Why it's needed:** When using Vercel AI SDK's `streamText`, bridging the async chunk generator cleanly up to an API router without leaking raw event emitters into business code is highly complicated.
- **What it does:** Changes the step interface contract. The platform opens up a dedicated server-sent event path for this step. The developer only interacts with standard Vercel AI SDK parameters (`streamText`, `streamObject`), while the platform interceptor pumps the text deltas out to the UI.

`onRollback` Configuration Option

- **Why it's needed:** Agents writing code, opening PRs, or blocking ports can leave an enterprise infrastructure in a broken state if the workflow encounters a critical timeout error 10 steps later.
- **What it does:** Implements the **Saga Pattern**. Every time a step completes successfully, its corresponding `onRollback` handler is pushed onto a local engine compensation stack. If a subsequent step triggers a non-recoverable error, the engine stops forward progress and executes the rollback hooks backward from the failure point, ensuring clean environment isolation.

### 3. Enterprise Event Stream Protocol Final Checklist

With these structural additions, your real-time protocol is fully optimized to power an incredibly reactive React frontend dashboard:

- **`agent:parallel_fork_started` / `agent:parallel_fork_completed`**: Triggered when processing multiple targets concurrently. *UI Impact: Transforms a single workflow layout view into an expandable collection of parallel tracks, showing individual loading spinners for each repository or infrastructure target.*
- **`agent:rollback_initiated` / `agent:rollback_completed`**: Triggered during a compensation sequence. *UI Impact: Visually shifts the Backstage status board into a retrograding orange alert mode, displaying: "Forward execution halted. Executing platform compensation cleanup handlers..."*

## **Dynamic DAG Topology (Bypassing steps dynamically)**, **SLA/Timeout Policies**, and **Global Event Hook Middleware (Interceptors)**

### 1. The Definitive Feature-Complete Fluent API

This version introduces method-level timeout policies, global interceptors, and explicit jump/bypass hooks (`ctx.goTo`) to allow complex runtime logic when a linear choice wrapper isn't enough.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const comprehensiveClusterOps = createAgentWorkflow({
  id: 'cluster-operations-workflow',
  stateSchema: ClusterState,
  inputSchema: ClusterInputSchema,
})
  // --- ADVANCED FEATURE 1: GLOBAL INTERCEPTORS (MIDDLEWARE) ---
  // Ideal for global logging, security audits, injectables, or modifying state globally
  .addInterceptor({
    onStepEnter: async (stepName, state, ctx) => {
      ctx.logger.info(`🛡️ Security Guard: Pre-step validation for [${stepName}]`);
    },
    onStepExit: async (stepName, stateDelta, ctx) => {
      // Automatically add tracking metadata to every single step return payload
      return { ...stateDelta, lastExecutedStep: stepName, updatedAt: new Date().toISOString() };
    }
  })

  // --- ADVANCED FEATURE 2: SLA & TIMEOUT MANAGEMENT ---
  .addStep('heavyInfrastructureScan', async (state, ctx) => {
    const clusterMetrics = await ctx.capabilities.backstage.kubernetes.gatherDeepMetrics();
    return { clusterMetrics };
  }, {
    // Enforce strict runtime execution constraints per individual step
    timeout: '5-minutes', 
    retryPolicy: { maximumAttempts: 2 }
  })

  // --- ADVANCED FEATURE 3: DYNAMIC DAG JUMP ROUTING ---
  .addStep('evaluateClusterRisk', async (state, ctx) => {
    const riskScore = calculateRisk(state.clusterMetrics);

    if (riskScore === 0) {
      ctx.logger.info('Zero risk identified. Bypassing patch pipeline directly to completion.');
      // Completely breaks the default sequential order and jumps cleanly to a later step or outcome
      return ctx.goTo('completeWithoutAction'); 
    }

    return { riskScore };
  })

  .addStep('applyEmergencyPatch', async (state, ctx) => {
    await ctx.capabilities.backstage.scaffolder.executeTemplate({ templateRef: 'apply-patch' });
  })

  .setTerminalOutcome('completeWithoutAction', (state, ctx) => {
    ctx.logger.info('Workflow ended gracefully with zero actions required.');
  });
```

### 2. Deep Dive: The Final Missing Architectural Additions

A. Global Workflow Interceptors (`.addInterceptor`)

- **Why it's needed:** In large organizations, you cannot rely on every individual developer to properly implement logging, compliance stamps, or token tracking on every single step.
- **What it does:** Implements the **Chain of Responsibility Pattern**. The core backend plugin passes the state and context through these registered interceptors before and after *every single step execution frame*. It allows platform teams to inject centralized corporate policies (like saving all diffs to an internal security bucket) seamlessly.

B. Granular Step SLAs & Timeouts (`timeout` option)

- **Why it's needed:** An LLM might take 20 seconds, but an internal Kubernetes health check could hang indefinitely if a cluster is down. Without per-step constraints, one broken internal service can freeze the entire Temporal execution thread worker indefinitely.
- **What it does:** Instructs the underlying Temporal engine to spin up a deterministic timer alongside the step activity. If the threshold is crossed, it gracefully raises a targetable timeout exception, triggering your retry or rollback policies cleanly without crashing the worker.

C. Dynamic DAG Jump Routing (`ctx.goTo`)

- **Why it's needed:** While `.addChoice()` is excellent for evaluating state cleanly *between* steps, real-world agent code often encounters situations *inside* the step processing loop where it realizes it needs to short-circuit, skip the next 3 steps, or exit early.
- **What it does:** Changes the return type structure. Instead of returning a state delta dictionary, the step handler can return a special framework routing signal wrapper (`ctx.goTo('destination')`). The execution engine captures this signal and instantly moves the pointer to the target step or terminal state name.

### 3. Ultimate Real-Time Monitoring & Audit Events

To finalize the event streaming contract, these last architectural states are introduced into the real-time stream:

- **`agent:step_timeout`**: Emitted when a step exceeds its explicit runtime configuration boundary. *UI Impact: Renders an active warning card in the log sequence stating: "SLA Breached: Step execution exceeded 5-minute allocation. Initiating automated failover sequence."*
- **`agent:pipeline_jump`**: Triggered when a step executes a `ctx.goTo()` bypass shortcut. *UI Impact: The Backstage UI DAG visualizer dynamically flashes and grays out the bypassed steps, shifting the glowing progress node directly to the new active target.*

## **Dynamic State Modification (Hot Swapping Memory)**, **State Forking & Merging (Multi-Hypothesis Testing)**, and **Long-Running Webhook Resumption (External Event Telemetry)**

When agents run inside an IDP like Backstage, a human operator might look at a paused workflow and say, *"The agent guessed the wrong cluster name in the state—let me fix it manually before it hits production."* Or, an advanced LLM might want to evaluate three different patch options in parallel, score them, and merge the best one back into the primary state.

### 1. The Ultimate Multi-Hypothesis & Interactive State API

This iteration adds capabilities for state mutations mid-flight, parallel hypothesis testing (forking), and long-running asynchronous wait states for external webhooks.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const advancedOpsWorkflow = createAgentWorkflow({
  id: 'advanced-ops-workflow',
  stateSchema: AdvancedState,
  inputSchema: AdvancedInputSchema,
})
  // --- ADVANCED FEATURE 1: MULTI-HYPOTHESTS FORKING ---
  // Spawns multiple identical state frames to test different actions.
  // The framework clones the state, runs the branches, and collects their final states.
  .addHypothesisFork('evaluateMitigationStrategies', {
    branches: {
      strategyA: (branch) => branch.addStep('testScaleUp', async (state, ctx) => {
        // Hypothesize changing replica counts
        return { proposedReplicas: 10, estimatedCostIncrease: 150 };
      }),
      strategyB: (branch) => branch.addStep('testInstanceUpgrade', async (state, ctx) => {
        // Hypothesize changing instance sizes
        return { proposedReplicas: 2, estimatedCostIncrease: 400 };
      }),
    },
    // Merges the competing states back into the main state track based on business value
    merge: (results, state) => {
      const bestStrategy = results.strategyA.estimatedCostIncrease < results.strategyB.estimatedCostIncrease 
        ? results.strategyA 
        : results.strategyB;
      return { selectedPlan: bestStrategy };
    }
  })

  // --- ADVANCED FEATURE 2: INTERACTIVE STATE BREAKPOINT ---
  // Pauses execution, exposes the *entire live state* to the Backstage UI,
  // and allows users with high-level RBAC permissions to rewrite fields before resuming.
  .addStep('reviewAndMutatePlan', async (state, ctx) => {
    ctx.logger.info('Entering human-inspectable state vault breakpoint.');

    // The framework pauses here, serializes the current state frame to the UI, 
    // and blocks until an authorized developer approves or edits the state keys.
    const updatedStateFields = await ctx.interaction.inspectAndMutateState({
      message: 'Review current AI plan. You may override values before final scaffolding execution.',
      mutableFields: ['selectedPlan.proposedReplicas']
    });

    return updatedStateFields; // Merges the human-injected edits directly into the workflow memory
  })

  // --- ADVANCED FEATURE 3: SECURE EXTERNAL WEBHOOK RESUMPTION ---
  // Generates a cryptographically signed callback URL for 3rd party webhooks (e.g. Datadog, SonarQube)
  // that do not have access to standard Backstage internal message queues.
  .addStep('triggerExternalSecurityScan', async (state, ctx) => {
    // 1. Ask the core plugin router to provision a single-use public webhook route mapped to this run
    const callbackUrl = await ctx.webhooks.createCallbackUrl({
      allowedSource: 'sonarqube.corp.internal',
      expiresIn: '1-hour'
    });

    // 2. Dispatch the callback URL to the third-party system
    await ctx.capabilities.backstage.scaffolder.triggerScan({
      repo: state.repoUrl,
      webhookReceiver: callbackUrl
    });

    // 3. Put the workflow to sleep until that specific signed endpoint receives a valid POST payload
    const webhookPayload = await ctx.webhooks.waitForPayload();

    return { scanPassed: webhookPayload.status === 'SUCCESS', vulnerabilities: webhookPayload.issues };
  });
```

### 2. Primitives Explained

```typescript
ctx.interaction.inspectAndMutateState(options)
```

- **Why it's needed:** AI agents occasionally suffer from minor hallucinations in structured data outputs (e.g., generating an incorrect YAML port mapping). Throwing away a 20-minute long-running deployment workflow because of one wrong string is frustrating.
- **What it does:** It creates an **Interactive Breakpoint**. It freezes the Temporal engine state and renders a structured JSON editor directly inside the user's Backstage dashboard. When an authorized engineer overwrites a key, the core framework re-validates the delta against your Zod `stateSchema` before resuming.

```typescript
.addHypothesisFork(name, options)
```

- **Why it's needed:** Advanced LLMs excel at self-correction when allowed to think like a human exploring multiple paths simultaneously (Tree of Thoughts / Monte Carlo Tree Search).
- **What it does:** It performs a hard state isolation fork. The underlying engine duplicates the exact state frame in memory, runs the distinct pipeline tracks concurrently as separate sub-threads, and yields them all up to a singular, type-safe `merge()` function to select the optimal path.

`ctx.webhooks.createCallbackUrl()` & `waitForPayload()`

- **Why it's needed:** While standard workflows use internal messaging, third-party enterprise tools (like a security pipeline runner running in a disconnected network) can only signal completion via standard HTTP POST webhooks.
- **What it does:** It mounts a temporary, cryptographically signed dynamic endpoint on your Backstage backend core plugin router (`/api/agent-core/webhook/callback/...`). It binds that HTTP request directly to a Temporal **Workflow Signal**, routing the incoming JSON payload right into the paused step execution stack.

### 3. Ultimate Observability & Telemetry Events

- **`agent:state_mutated_by_human`**: Triggered when an operator overrides fields during an inspection breakpoint. *UI Impact: Logs a prominent security audit flag showing: "Manual Override: Field `proposedReplicas` altered from 10 to 4 by user:admin."*
- **`agent:hypothesis_forked` / `agent:hypothesis_merged`**: Emitted during parallel path evaluation. *UI Impact: Displays side-by-side comparative simulation tracks on the visual timeline, closing out with a checkmark badge on the branch chosen by the merge rule.*
- **`agent:webhook_listener_mounted`**: Emitted when waiting for an external HTTP callback. *UI Impact: Generates an explicit "Awaiting Webhook Payload" card displaying the temporary signed URL for easy copying or administrative debugging.*

## Versioning breaking changes over years, managing long-running resource contention, debugging crashes in production, and hot-swapping operational configurations

### 1. The Operational Lifecycle API Extension

This final evolution completes the specification by introducing **Workflow Evolution Hooks (Migrations)**, **Global Concurrency & Quota Throttling**, **Dynamic Hot-Swapping Policies**, and **Interpreted Failure Escape Hatches**.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const cloudMigrationWorkflow = createAgentWorkflow({
  id: 'cloud-migration-workflow',
  stateSchema: MigrationState,
  inputSchema: MigrationInputSchema,
})
  // --- 1. WORKFLOW SCHEMALESS VERSIONING & MIGRATIONS ---
  // Crucial for long-running workflows (HIPAA/FINRA) that may live for months.
  // If a workflow was started 6 months ago on v1, this handles upgrading it mid-flight.
  .configureVersion({
    currentVersion: 3,
    migrations: {
      'v1-to-v2': (oldState) => ({ ...oldState, tenantClassification: 'LEGACY' }),
      'v2-to-v3': (oldState) => ({ ...oldState, complianceMasks: ['HIPAA_PHI'] }),
    }
  })

  // --- 2. GLOBAL RATE-LIMITING & CONCURRENCY CONTROLS ---
  // Prevents an agent from launching 500 simultaneous GitHub PRs or burning $10k in OpenAI credits
  .configureThrottling({
    maxConcurrentRunsPerTenant: 5,
    maxLLMTokensPerMinute: 100_000,
    capabilityRateLimits: {
      'backstage:scaffolder': { maxInvocationsPerMinute: 10 },
      'github': { maxRequestsPerSecond: 2 }
    }
  })

  // --- STEP 1: RESOLVE CLOUD TARGETS ---
  .addStep('gatherCloudInventory', async (state, ctx) => {
    // 3. Dynamic Configuration Rehydration
    // Allows operations teams to change settings (e.g. model endpoints) *while the agent runs*
    const dynamicModel = ctx.config.getDynamicValue('preferred-llm-model', 'gpt-4o');

    const inventory = await ctx.capabilities.aws.getClusterInventory();
    return { inventory, activeModel: dynamicModel };
  })

  // --- STEP 2: ESCAPE HATCH EXCEPTION MANAGER ---
  .addStep('executeClusterScaffolding', async (state, ctx) => {
    return await ctx.capabilities.backstage.scaffolder.runMassiveProvisioning({
      targets: state.inventory
    });
  }, {
    // 4. Operational Escape Hatch: If all automatic retries blow up,
    // don't just crash the workflow. Route it to a human administrator to fix live.
    onMaxRetriesExceeded: async (error, state, ctx) => {
      ctx.logger.error('Scaffolding pipeline fatally stalled. Routing to operations emergency room.');

      const resolution = await ctx.interaction.adminOverrideCatch({
        error: error.message,
        actions: ['RETRY_WITH_NEW_CONFIG', 'FORCE_MARK_SUCCESS', 'GRACEFUL_ABORT']
      });

      if (resolution.action === 'FORCE_MARK_SUCCESS') {
        return { scaffoldingStatus: 'MANUALLY_FORCED_SUCCESS' };
      }

      return ctx.goTo('initiateGracefulRollback');
    }
  });
```

### 2. The Four Final Primitives Explained

A. Workflow Versioning & State Migrations (`.configureVersion`)

- **The Problem:** Because you use **Temporal**, a workflow definition is deterministic. If a workflow runs for a month (waiting for hardware provisioning or compliance signatures) and you deploy a code change that adds a step or alters the `stateSchema`, the Temporal worker will panic with a `NondeterminismError` and corrupt the history.
- **The Framework Fix:** By explicitly adding a migration registry, your core plugin injects Temporal versioning markers (`Workflow.getVersion`) under the hood. When older running steps awaken, the engine runs the schema transformer to catch the running memory state up to the current schema definition smoothly.

B. Global Resource Throttling (`.configureThrottling`)

- **The Problem:** An agent containing a loop checking code patterns could trigger an accidental denial-of-service attack on your enterprise GitHub Enterprise server or hit OpenAI rate limits instantly, starving out all other corporate plugins.
- **The Framework Fix:** The core runtime provisions **Temporal Task Queues and Rate Limiters** mapped to the capability boundaries. The fluent context tracks token expenditure dynamically, auto-pausing execution blocks before breaches occur.

C. Dynamic Configuration Rehydration (`ctx.config.getDynamicValue`)

- **The Problem:** Hardcoding configurations or tying them strictly to static workflow inputs prevents operations teams from modifying runtime behaviors during a multi-day execution block (e.g., swapping a failing LLM provider for a fallback one).
- **The Framework Fix:** Context variables hook directly into Backstage's unified config structure via an active observer pattern, enabling real-time hot-swapping of thresholds without altering state history.

D. Operational Emergency Escape Hatches (`onMaxRetriesExceeded`)

- **The Problem:** Standard circuit breakers simply drop execution when retries fail. In an IDP platform, if an infrastructure migration stalls halfway, a generic error drop leaves half-built nodes active.
- **The Framework Fix:** Instead of crashing, the engine traps the maximum failure exception and creates an administrative triage instance inside the Backstage frontend, giving operations engineers the power to rewrite context properties or manually bypass the failing node.

### 3. Comprehensive Administrative Stream Events

To fully support enterprise operation centers, the streaming protocol emits these final infrastructure diagnostics:

- **`agent:workflow_migrated`**: Emitted when a long-running workflow crosses a version upgrade block mid-flight. *UI Impact: Displays a system banner: "Workflow state upgraded from v1 to v2 dynamically by engine."*
- **`agent:quota_throttled`**: Emitted when an agent hits an API rate limit boundary. *UI Impact: Animates a warning state on the log container: "Rate Limit Enforced: GitHub requests temporarily throttled for 12 seconds to prevent token exhaustion."*
- **`agent:emergency_triage_active`**: Emitted when standard retries fail and an administrative intervention is requested. *UI Impact: Pings the platform operations channel and opens a root control terminal over the broken node.*

## **Cross-Tenant State Isolation Violations (Secret Management)** and **Temporal History Blob Exhaustion**

When an architecture covers business logic, compliance, multi-agent scaling, error recovery, and long-running state migrations, it represents a highly mature framework. However, looking at this framework through the lens of a **Backstage Core Platform Architect**, there are **two final structural considerations** that will determine if this platform succeeds in a real-world enterprise: **Cross-Tenant State Isolation Violations (Secret Management)** and **Temporal History Blob Exhaustion**.

### 1. The Definitive, Production-Hardened Specification

This evolution introduces **Dynamic Secret Redaction Envelopes** and **State Compression Checkpoints (Workflow Reset Boundaries)** to protect database memory and credentials.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { z } from 'zod';

export const ultimateEnterpriseWorkflow = createAgentWorkflow({
  id: 'ultimate-enterprise-workflow',
  stateSchema: ExtendedState,
  inputSchema: ExtendedInputSchema,
})
  // --- 1. MEMORY HISTORY COMPRESSION POLICY ---
  // Crucial for long loops (e.g. self-correcting agents running 50+ iterations).
  // Prevents the Temporal Event History from hitting the hard 50,000 event limit
  // by automatically snapshotting and resetting the workflow under the hood.
  .configureStorage({
    historyOptimization: {
      autoContinueAsNew: true,
      maxEventsBeforeSnapshot: 10_000,
    }
  })

  // --- STEP 1: RESOLVE VAULT SECRETS SECURELY ---
  .addStep('fetchInfrastructureCredentials', async (state, ctx) => {
    // 2. Dynamic Secret Isolation Envelope
    // Returns a cryptographically tracked secret wrapper rather than plaintext data.
    // This wrapper is completely blacked out from logs, telemetry spans, and UI state streaming.
    const cloudCredentials = await ctx.secrets.getScopedVaultSecret({
      secretPath: `secret/data/tenants/${ctx.tenant.id}/aws-deploy-key`
    });

    // Storing this inside the state dictionary saves only the token reference wrapper pointer, 
    // never the plaintext string, avoiding accidental leakage to database backups.
    return { deploymentTokenRef: cloudCredentials.referenceId };
  })

  // --- STEP 2: LOOP WITH AUTO-CLEANUP ---
  .repeatUntil('iterativeCloudScanning', {
    condition: (state) => state.scanComplete === true,
    pipeline: (loop) => loop
      .addStep('executeScanChunk', async (state, ctx) => {
        // Plaintext secrets are only resolved in-memory exactly when invoking a capability driver.
        // The driver decrypts the token ref on the fly, keeping it out of the application space.
        const chunkResults = await ctx.capabilities.aws.scanInfrastructureChunk({
          tokenRef: state.deploymentTokenRef,
          offset: state.scanOffset
        });

        return { 
          scanOffset: state.scanOffset + 100, 
          scanComplete: chunkResults.isDone 
        };
      })
  });
```

### 2. The Final Two Technical Primitives

A. Temporal Event History Protection (`autoContinueAsNew`)

- **The Problem:** In an agentic loop (like self-correcting code generation or massive asset scanning), a workflow might run for thousands of steps. Temporal has a hard limit of **50,000 events** in its history blob. If an agent exceeds this, the workflow forcefully terminates and crashes, causing data loss.
- **The Framework Fix:** By configuring `autoContinueAsNew`, the core plugin automatically tracks the length of the event history. When the threshold is crossed, the framework snapshots the active `stateSchema`, cleanly invokes Temporal's native `ContinueAsNew` command, wipes the historical event log clean, and spins up a fresh execution thread using the exact state frame from the previous loop iteration.

B. Ephemeral Secret Redaction Envelopes (`ctx.secrets`)

- **The Problem:** Third-party developers frequently fetch API tokens or passwords from vaults and accidentally assign them to the main `state` object. The moment the framework saves that state or streams it to the Backstage UI via SSE, the company's root production credentials are split across standard logs, Elasticsearch indexes, and browser local storages.
- **The Framework Fix:** The context object provides a `.secrets` manager. Any credential fetched is wrapped inside a custom JS Class object. When serialized via `JSON.stringify()` (for logs, storage, or streaming), the class outputs only `[ENCRYPTED_SECRET_REFERENCE]`. The actual plaintext string is extracted only at the native network call level inside your framework-provided capability drivers.

### 3. Critical Diagnostic Stream Events

To complete the operational suite, the framework's protocol handles these two safety diagnostics:

- **`agent:history_compacted`**: Emitted when the engine runs a snapshot reset to clear execution logs. *UI Impact: Displays an infrastructure marker on the timeline: "Performance Optimization: Workflow history compressed and continued natively."*
- **`agent:secret_leak_blocked`**: Triggered if a step tries to output a raw, unencrypted private key string into the execution delta block. *UI Impact: Immediately redacts the payload, prevents saving to the state store, and issues a security diagnostic warning.*

## **Deterministic Unit Testing**, **Time-Travel Debugging**, and **Adversarial / Chaos Testing**

To make testing these complex, long-running agentic workflows intuitive for developers, you need to provide a dedicated testing utility toolkit. Testing an agent should not require spinning up a real Temporal cluster or authenticating with actual GitHub/PagerDuty instances.

The test utilities should focus on three testing paradigms: **Deterministic Unit Testing**, **Time-Travel Debugging**, and **Adversarial / Chaos Testing**.

Here are the core test utilities you should provide in the framework:

### 1. The Isolated Workflow Harness (`createTestHarness`)

This is the root utility that compiles the developer's workflow into an isolated, in-memory execution frame.

- **State Hydration:** Allows developers to seed the workflow at a specific intermediate state (e.g., skip step 1 and step 2, and start directly at the `analyze` step with pre-filled mock data).
- **Step-by-Step Step Driving:** Provides a `.next()` or `.stepUntil('stepName')` method. This allows developers to execute a single step block at a time, pausing to inspect the `state` delta before moving forward, effectively turning their unit tests into an programmatic debugger.
- Auto-Mocking Capability Drivers (`mockCapabilities`)

Developers shouldn't write custom mocks for the 8 third-party and 3 internal Backstage capabilities. You should provide pre-built, strongly-typed mocking factories.

- **Fluent Capability Mocking:** Developers can easily declare what a capability should return when called (e.g., `mock.capabilities.github.getRecentCommits.returns([...])`).
- **Assertion Inspectors:** The harness should track all capability calls, allowing assertions like `expect(harness.capabilities.github.createPullRequest).toHaveBeenCalledWith({...})`.
- Virtual Clock & Time-Travel Control (`ctx.clock`)

Since your workflows handle long-running operations, webhooks, and SLAs (e.g., `.waitForSignal` with a 30-minute timeout), tests cannot wait in real time.

- **Virtual Time Advancement:** A `harness.clock.advanceTime('30m')` utility that instantly triggers Temporal's internal timer boundaries, allowing developers to test timeout fallback paths and compensation rollbacks in milliseconds.
- Interactive Interaction Responders (`mockInteractions`)

Workflows that utilize Human-in-the-Loop steps (`askUser` or `requireApproval`) will block indefinitely in a standard test execution loop.

- **Auto-Responders:** Utilities to queue up human actions ahead of time (e.g., `harness.interactions.expectPrompt('Select Destination Cluster').respondWith({ selectedEnv: 'staging' })`). The harness will automatically feed this response into the workflow the moment it hits that execution boundary.
- Adversarial Error & Chaos Injectors (`injectChaos`)

Regulatory compliance and high availability require testing how agents behave when the infrastructure crumbles.

- **Transient Failure Simulations:** A utility to make a capability fail exactly N times before succeeding (e.g., `mock.capabilities.pagerduty.failTransiently(2)`). This verifies that the developer's `.configureResilience` policies and Temporal retry loops behave correctly.
- **Non-Retryable Fault Injection:** Forces an external platform call to throw a fatal exception to ensure that the workflow's `onRollback` (Saga pattern) or `onMaxRetriesExceeded` administrative escape hatch fires properly.
- Security & Leak Trackers

A built-in test assertion utility that scans the final execution state history frame.

- **Secret Leak Detection Assertions:** An out-of-the-box assertion like `expect(harness).toHaveNoLeakedSecrets()`. It scans the serialized history log to guarantee no developer accidentally leaked plaintext keys from the `ctx.secrets` manager into the state store.

## Extensible Plugin/Middleware Pattern

To allow third-party developers to decorate, intercept, or extend methods without breaking the fluent chain or resorting to messy class inheritance hierarchies, you should implement an **Extensible Plugin/Middleware Pattern** directly on your base `WorkflowBuilder`.

If developers rely solely on standard class extension (`class CustomBuilder extends WorkflowBuilder`), they lose the ability to easily mix and match decorations from different shared libraries. For example, a developer might want to add a custom `.withTelemetry()` decorator *and* a `.withDatadogAlerts()` decorator at the same time.

Here are the best architectural strategies for handling decoration, addition, and modification cleanly in your core IDP framework.

### 1. Decorating Methods via a Plugin/Extension Registry

Instead of making the builder rigid, the base `WorkflowBuilder` can accept extensions that hook into the core execution lifecycles. Think of this like **Webpack plugins** or **Express middleware** for your fluent API.

The Architecture

The base `WorkflowBuilder` exposes an `.extend()` method. An extension is a simple object that registers interceptors for when steps are registered (`onStepAdd`) or when steps are executed (`onStepRun`).

```typescript
// Third-party developer writes an elegant decorator plugin
const notifySlackOnStepFailure = () => ({
  name: 'slack-failure-notifier',
  // Hook fired during the compilation/registration phase
  onStepAdd: (stepName, originalHandler, stepOptions) => {
    // Return a decorated version of the original step handler function
    return async (state, ctx) => {
      try {
        return await originalHandler(state, ctx);
      } catch (error) {
        await ctx.capabilities.slack.sendMessage(`Step ${stepName} failed!`);
        throw error; // Maintain original error bubble
      }
    };
  }
});

// Consuming it in the workflow definition is seamless and doesn't break the fluent chain
export const alertTunerWorkflow = createAgentWorkflow({ ... })
  .extend(notifySlackOnStepFailure()) // Registers the decorator
  .addStep('observe', async (state, ctx) => { ... }); // Naturally decorated under the hood
```

### 2. Adding and Modifying Fluent Methods via Higher-Order Wrappers

If an agentic workflow plugin wants to add a completely new fluent method name (e.g., `.addSecOpsValidation()`), or modify how an existing one behaves, you have two primary options: **Functional Composition Helpers** or **TypeScript Mixins / Dynamic Proxies**.

Strategy A: Functional Composition (Most Maintainable)

Instead of altering the builder itself, developers write higher-order functions that take the builder, execute a series of actions, and return the builder back. This keeps the core plugin clean and highly composable.

```typescript
// Helper function that groups custom security logic and appends it to any builder
function addEnterpriseSecurityGate(builder: WorkflowBuilder<any, any>) {
  return builder
    .addStep('runSonarScan', async (state, ctx) => { ... })
    .addChoice('evaluateVulnerabilities', (state) => { ... });
}

// Usage remains perfectly clean and readable
const myWorkflow = createAgentWorkflow({ ... });
addEnterpriseSecurityGate(myWorkflow)
  .addStep('deployFinalManifest', async (state, ctx) => { ... });
```

Strategy B: Dynamic Proxies / Mixins (For True API Customization)

If you want to let developers literally call `.addMyCustomMethod()` directly on the fluent chain, you can design your `createAgentWorkflow` factory to use a **JavaScript Proxy**. The proxy intercepts property access. If a developer registers a custom method, the proxy routes it to their custom handler; otherwise, it falls back to the base `WorkflowBuilder`.

Summary of Extensibility Recommendations

- **For Decorating Execution Behavior:** Use the **Extension Registry** (`.extend()`). It gives developers complete cross-cutting access to wrap step execution frames in custom telemetry, notification, or caching wrappers without changing the surface-level pipeline code.
- **For Reusable Logic Blocks:** Use **Functional Composition**. It allows teams to build shared corporate step libraries (e.g., standard deployment paths) that can be piped into any new agent workflow seamlessly.
- **For Changing the Syntax / API Surface:** Use a **Proxy Factory Wrapper**. This handles true runtime alteration of the fluent interface keywords while preserving underlying core type-safety mechanisms.

## **Adaptive Conditional Steps** and **Graceful Bypass Rules**

To handle mixed permission levels cleanly without scattering `if/else` authorization boilerplate inside your core business logic, you can leverage the **declarative step configuration block** combined with a concept of **Adaptive Conditional Steps** or **Graceful Bypass Rules**.

In a production IDP like Backstage, you want to avoid throwing a hard `403 Forbidden` error that crashes the entire multi-hour workflow just because a normal user hit a step they don't have access to. Instead, the framework should either **gracefully skip** that step, **route to a fallback behavior**, or **elevate to a human-in-the-loop approval request**.

Here is how you can naturally express mixed permission workflows using your fluent API.

### 1. The Adaptive Permission API

You can introduce an `onUnauthorized` routing strategy directly inside the step options. This tells the core engine exactly how to handle the step if the active `ctx.userRef` fails the RBAC check.

```typescript
import { createAgentWorkflow } from '@backstage/plugin-agent-core-backend';
import { catalogEntityModifyPermission, secretDeployPermission } from './permissions';

export const clusterTriageWorkflow = createAgentWorkflow({
  id: 'cluster-triage-workflow',
  stateSchema: TriageState,
  inputSchema: TriageInputSchema,
})
  // --- STEP 1: SAFE FOR ALL USERS ---
  .addStep('gatherLogsAndMetrics', async (state, ctx) => {
    const logs = await ctx.capabilities.backstage.kubernetes.getLogs();
    return { logs };
  })

  // --- STEP 2: PRIVILEGED OPERATION WITH AUTO-BYPASS ---
  .addStep('optimizeClusterQuotas', async (state, ctx) => {
    // This heavy mutating action only runs for users with proper catalog clearance
    await ctx.capabilities.backstage.kubernetes.tuneQuotas({ target: state.clusterId });
    return { optimized: true };
  }, {
    authorize: {
      permission: catalogEntityModifyPermission,
      getAttributes: (ctx) => ({ entityRef: ctx.input.serviceId }),
    },
    // CRITICAL TRANSITION: If a normal user runs this, the engine logs it, 
    // skips the code execution entirely, and seamlessly moves to the next step.
    onUnauthorized: 'skip' 
  })

  // --- STEP 3: HIGH-PRIVILEGE OPERATION WITH ESCALATION ROUTING ---
  .addStep('applySecurityHotfixPatch', async (state, ctx) => {
    await ctx.capabilities.github.mergeSecurityPR({ prId: state.prId });
    return { patchDeployed: true };
  }, {
    authorize: {
      permission: secretDeployPermission,
    },
    // ALTERNATIVE TRANSITION: If a normal user triggers this, instead of skipping,
    // the workflow automatically halts and spins up an interactive approval block 
    // requiring an administrator to sign off on their behalf.
    onUnauthorized: {
      strategy: 'escalate-to-approval',
      assignedRole: 'role:default/platform-admins',
      prompt: 'A non-admin user initiated a secure infrastructure patch. Admin approval required.'
    }
  });
```

### 2. Under the Hood: The Core Execution Engine Logic

When the Temporal worker parses this compiled workflow definition, it processes the `authorize` block through the Backstage `PermissionEvaluator` right before entering the step handler framework execution frame.

The core engine maps the `onUnauthorized` parameter to three explicit structural behaviors:

| `onUnauthorized` Strategy          | How the Engine Handles Execution                             | UI Event Emitted                    |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| **`"skip"`** *(Adaptive Bypass)*   | Evaluates the RBAC token. If denied, it ignores the handler function, injects a default empty state delta (`{}`), and instantly advances the instruction pointer to the next sequential step. | `agent:step_bypassed_by_permission` |
| **`"escalate-to-approval"`**       | Pauses execution. Converts the step into an async Temporal signal sleep state. Renders an approval ticket in the administrative Backstage control feed. Once an admin approves, execution resumes. | `agent:human_in_the_loop_required`  |
| **`"abort"`** *(Default Behavior)* | Immediately stops the workflow, marking the overall run status as `FAILED_UNAUTHORIZED`. | `agent:permission_denied`           |

### 3. Benefits of this Declarative Approach

1. **Perfect UI Transparency:** Because permissions are declared in the structural configuration block rather than buried inside an `if (user.hasRole(...))` block in the handler, your frontend DAG visualizer can preview the pipeline adaptively. If a normal user opens the plugin, the UI can immediately render a small lock icon or a dashed outline around the privileged steps, clearly showing them: *"These operations will be skipped or escalated based on your access level."*
2. **Simplified Audit Logs:** Your platform-wide interceptor registry can automatically capture the outcome of the `authorize` block, creating a clear compliance trail showing exactly where steps were bypassed or routed to admin review.

## context-aware Platform Orchestrator

Expanding your API to naturally expose Backstage's broader ecosystem transforms the framework from a standard task runner into a **context-aware Platform Orchestrator**. Since Backstage serves as an engineering organization's unified source of truth, an agent utilizing simple fluent methods to interact with native platform services can handle operations that usually require manual cross-referencing.

Integrating six primary native Backstage features into your core `AgentContext` via fluent methods provides high-value capabilities.

### 1. The Core Software Catalog (`ctx.catalog`)

Instead of third-party developers writing ad-hoc API queries or HTTP clients to parse ownership, your framework can expose Backstage's highly structured dependency graph natively.

- **`.getEntity(entityRef)`**: Instantly loads the metadata of a microservice, API, or resource.
- **`.getOwner(entityRef)`**: Traverses catalog relations to find the exact Backstage `Group` or `User` that owns a service. This is ideal when an agent detects an incident and needs to know precisely who to page or tag in an escalation.
- **`.getSystemDependencies(systemId)`**: Allows an agent to chart the entire upstream and downstream topological map of an application before making a critical infrastructure patch.
- Backstage Search Platform (`ctx.search`)

Backstage's search backend routinely index-gathers data across internal documents, catalog definitions, and external tool records. Exposing it lets you easily construct your **Retrieval-Augmented Generation (RAG)** context patterns.

- **`.query(term, types[])`**: Searches across catalog objects, indexed Markdown documents, or TechDocs in one unified sweep. An agent can use this to crawl historical architecture decision records (ADRs) or troubleshooting steps when attempting to solve a runtime failure.
- Native Notification Service (`ctx.notifications`)

By building directly on Backstage's native notification dispatch layer, you allow agents to communicate across channels through the central portal, bypassing the need for separate email or Slack configurations.

- **`.send(userOrGroupRef, messagePayload)`**: Drops real-time alerts straight into a developer's Backstage bell-notification pane or standard team communication webhooks.
- **`.requestAction(userRef, actionToken)`**: Sends an actionable inbox item (like an approval card or validation input prompt) to a specific user or designated administrator queue.
- Auth & Sign-In Identities (`ctx.identity`)

Because compliance regimes like SOC-2 require verifiable execution trails, exposing the Backstage token exchange mechanisms is crucial.

- **`.getIdentityCredentials()`**: Extracts the cryptographically scoped Backstage user token initiating the execution.
- **`.onBehalfOf(userRef, block)`**: A safe delegation utility allowing an agent to perform catalog updates or trigger a code template *using the user's specific access rights*, ensuring native Backstage RBAC remains the ultimate gatekeeper for downstream mutations.

## Plugin Metrics & DORA Telemetry (`ctx.metrics`)

Many enterprises install plugins to aggregate DORA metrics (Deployment Frequency, Lead Time to Changes, Change Failure Rate).

- **`.getDoraMetrics(entityRef)`**: Extracts the service health data directly out of the catalog's linked analytical plugins. An AI workflow can actively look at a service's Change Failure Rate *before* opting to push an automated configuration hotfix, backing away if the service is already unstable.

## Central Audit Logs Core Plugin (`ctx.audit`)

Backstage features structured internal auditing schemas out of the box.

- **`.logSecurityEvent(action, target)`**: Emits compliance events natively to the IDP's immutable platform records. This makes it trivial for an agent to record critical events like: `"Agent [cluster-ops] reading environment variables on behalf of user:developer-one"` for future security verification.

### What the Updated Developer Context Looks Like

When these native subsystems are layered alongside your existing framework abstractions, the developer's execution context signature reads as a comprehensive, highly expressive platform toolkit:

```typescript
export interface AgentContext<TInput> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';
  userRef: string;

  // --- Core Agent Infrastructure ---
  ai: VercelAiSdkWrapper;
  memory: VectorDbEmbeddingFacade;

  // --- Native Backstage Feature Primitives ---
  catalog: {
    getEntity: (ref: string) => Promise<CatalogEntity>;
    getOwner: (ref: string) => Promise<UserOrGroupEntity>;
    getSystemDependencies: (systemId: string) => Promise<CatalogEntity[]>;
  };

  search: {
    query: (text: string, options: { kinds?: string[] }) => Promise<SearchResult[]>;
  };

  notifications: {
    send: (targetRef: string, content: NotificationEnvelope) => Promise<void>;
    requestAction: (targetRef: string, responseSchema: any) => Promise<any>;
  };

  identity: {
    getIdentityCredentials: () => Promise<BackstageAuthToken>;
  };

  // --- External & Operational Tools ---
  capabilities: {
    backstage: {
      scaffolder: ScaffolderClient;
      kubernetes: KubernetesClient;
      techdocs: TechDocsClient;
    };
    github: GitHubCapabilityDriver;
    pagerduty: PagerDutyCapabilityDriver;
  };
}
```

## Core Backend Service APIs

### 1. The Distributed Scheduler Core Service (`ctx.scheduler`)

In an agentic workflow framework, not all workflows are triggered manually by a user in the UI. Many maintenance tasks (like sweeping for orphaned Kubernetes clusters or renewing expired access tokens) must run as background cron tasks or pollers.

- **.scheduleTask(options)**: Instead of developers rolling their own `setInterval` (which breaks across multiple clustered backend nodes), this delegates to Backstage's distributed task scheduler. It coordinates via the central database to guarantee that a periodic agent loop triggers **exactly once** across your horizontal backend fleet.
- High-Performance Cache Service (`ctx.cache`)

Agentic loops that heavily utilize LLMs often query the exact same data points over and over (e.g., checking a repo's `package.json` file or loading cluster metadata across 10 iterations of a self-correcting cycle). Calling active capability drivers every split second can hit platform rate limits.

- **.cache.get(key) / .cache.set(key, value, ttl)**: Hooks directly into the native Backstage `CacheService` (which usually maps to Redis or Memcached in enterprise deployments). This lets agents persist transient data structures across distinct steps safely, bypassing expensive external HTTP or LLM network overhead.
- Native URL Reader Service (`ctx.urlReader`)

Agents frequently need to extract code snippets, configuration specs (`app-config.yaml`), or documentation files from diverse version control repositories (GitHub, GitLab, Bitbucket, AWS S3). Writing custom code clients for each provider is highly tedious.

- **.readUrl(url)**: Exposes Backstage's core `UrlReaderService`. It completely abstracts the underlying provider away. The agent simply passes an internal repository file path string, and the core engine automatically resolves authentication, fetches corporate credentials, routes around firewalls, and reads the raw source text buffer into your agent step logic.

#### Relational Database Interface (`ctx.db`)

While the framework handles transient workflow states natively via **Temporal**, advanced plugins may need to manage separate relational tables (e.g., a permanent index tracking every patch applied historically, or tracking cost savings records over time for analytical dashboards).

- **.db.getClient()**: Instantiates a pre-configured, multi-tenant aware instance of Backstage's native relational database layer (powered by `Knex` connecting to PostgreSQL). This avoids forcing developers to pass manual credentials, handle connection pools, or risk mixing tenant partitions when logging structured reporting metrics.

### Expanded Execution Context Schema

Adding these underlying architectural primitives yields an absolute production-ready developer surface area:

```typescript
export interface AgentContext<TInput> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';

  // --- Core Platform Systems ---
  catalog: CatalogFacade;
  search: SearchFacade;
  notifications: NotificationFacade;

  // --- Native Backend Plumbing Hooks ---
  cache: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: (key: string, value: any, ttlMs?: number) => Promise<void>;
  };

  urlReader: {
    /** Reads raw file contents from any authenticated repo hook (GitLab, S3, GitHub) */
    readUrl: (url: string) => Promise<Buffer>;
  };

  db: {
    /** Accesses the isolated relational connection pool mapped to this plugin */
    getClient: () => Promise<Knex>;
  };

  scheduler: {
    scheduleTask: (config: TaskScheduleDefinition) => Promise<void>;
  };
}
```

### 1. Inter-Plugin Routing Engine (`ctx.discovery`)

In an IDP, your core agent plugin shouldn't need hardcoded internal URLs for other local plugins (e.g., the SonarQube backend, the Nexus proxy, or a custom internal security scanner plugin).

- **`.discovery.getBaseUrl(pluginId)`**: Exposes the native Backstage `DiscoveryService`. It automatically resolves the exact physical, cluster-local network URL for any other registered Backstage backend plugin, handling multi-instance routing, reverse proxies, and infrastructure abstractions out-of-the-box.

#### Token-to-User Inversion (`ctx.userInfo`)

When an external system triggers a scheduled agent or an incoming webhook fires (`ctx.webhooks.waitForPayload`), the agent often receives a raw Backstage authorization header or cryptographic token.

- **`.userInfo.getUserInfo(token)`**: Exposes the native `UserInfoService`. It maps an active session token back to a structured user profile metadata object containing their real name, primary email address, and avatar string. This makes it trivial for an agent to build user-friendly UI interactions like dropping a personalized notification.

#### App Lifecycle Hooks (`ctx.lifecycle`)

Agentic workflows operating inside a **Temporal worker thread pool** must coordinate cleanly with the lifecycle of the actual node process hosting them (e.g., when a Kubernetes pod hosting Backstage receives a `SIGTERM` rollout signal).

- **`.lifecycle.addShutdownHook(fn)`**: Exposes the native `LifecycleService`. If the Backstage host instance is gracefully shutting down or restarting while an agent step is processing, this hook fires. This allows developers to explicitly cleanly checkpoint progress, drain a long-running sub-process buffer, or release an exclusive execution lock before the thread is forcefully evicted.

#### Direct Plugin Interoperability (`ctx.pluginMetadata`)

When writing shared third-party middleware or reusable extension interceptors (`.addInterceptor`), a module frequently needs to know exactly which plugin initiated it for tracking, rate-limiting, or billing purposes.

- **`.plugin.getId()`**: Exposes the immutable `PluginMetadataService`. It informs the execution context exactly which third-party workspace plugin instance is executing the workflow pipeline, making global compliance tagging and telemetry metrics tracking completely automated.

#### Exposing the Ultimate Context Signature

Integrating this final plumbing tier completes the core capabilities of the execution context:

```typescript
export interface AgentContext<TInput> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';

  // --- Core Platform Systems ---
  catalog: CatalogFacade;
  search: SearchFacade;
  notifications: NotificationFacade;

  // --- Core Architecture Services ---
  cache: CacheServiceFacade;
  urlReader: UrlReaderFacade;
  db: DatabaseFacade;
  scheduler: SchedulerFacade;

  // --- The Final Plumbing Tier ---
  discovery: {
    /** Resolves the live internal internal URI of any neighboring Backstage plugin */
    getBaseUrl: (pluginId: string) => Promise<string>;
  };

  userInfo: {
    /** Decodes raw auth credentials into a clean, human-readable profile interface */
    getUserInfo: (token: string) => Promise<BackstageUserProfile>;
  };

  lifecycle: {
    /** Registers emergency hooks that run if the hosting pod is restarted or killed */
    addShutdownHook: (hookFn: () => Promise<void>) => void;
  };

  plugin: {
    /** Tracks the exact ID of the consuming workspace plugin for metric gathering */
    getId: () => string;
  };
}
```

## Event Transformer Registry

We have **not yet fully covered this specific payload modification capability** in the plan so far. While our `.extend()` plugin registry allows developers to intercept step *execution* logic (wrapping the code in try/catches or adding spans), it doesn't explicitly define how to intercept the framework's internal **UI Event Stream Processor**.

If a plugin author wants to modify, add, or delete keys from standard event payloads like `agent:step_enter`, they need a hook that intercepts events *right before* they are serialized and pushed down the server-sent events (SSE) or WebSocket pipeline to the Backstage UI.

To solve this cleanly, you should add an **Event Transformer Registry**

 to the global `.addInterceptor()` or `.extend()` configuration.

### The Architectural Solution: Event Interceptors

By adding an `onEmit` or `transformEvent` lifecycle hook to the framework's interceptor system, plugin authors can intercept and mutate the live outgoing event stream.

Here is how a plugin author would write a decorator to modify, add, or delete payload keys using the framework:

```typescript
export const customTunerWorkflow = createAgentWorkflow({ ... })
  // Hooking into the event pipeline
  .addInterceptor({
    transformEvent: (event, ctx) => {
      // 1. MODIFYING an existing payload key (e.g., transforming timestamp to UNIX epoch or ISO variant)
      if (event.type === 'agent:step_enter') {
        event.payload.timestamp = new Date(event.payload.timestamp).getTime();
      }

      // 2. ADDING a new payload key (e.g., injecting the tenant ID or corporate tracking labels into all events)
      event.payload.tenantId = ctx.tenant.id;
      event.payload.environmentMode = ctx.config.getDynamicValue('env-mode', 'prod');

      // 3. DELETING an existing payload key (e.g., clearing sensitive metadata references for compliance)
      if (event.payload.internalMetadata) {
        delete event.payload.internalMetadata;
      }

      // Return the mutated event back to the core framework emitter pipeline
      return event; 
    }
  });
```

### How the Framework Engine Implements This Under the Hood

Inside your core backend plugin's event dispatcher, the `emitWorkflowEvent` routine passes every raw system event through the registered `transformEvent` array stack sequentially before shipping it out to the network interface:

```typescript
// Inside your Core Framework Event Dispatcher
async function emitWorkflowEvent(type: string, rawPayload: any, ctx: any) {
  let eventEnvelope = { type, payload: { ...rawPayload }, timestamp: new Date().toISOString() };

  // Loop through registered interceptors to modify, append, or purge payload keys
  for (const interceptor of compiledWorkflow.interceptors) {
    if (interceptor.transformEvent) {
      eventEnvelope = await interceptor.transformEvent(eventEnvelope, ctx);

      // Safety check: if an interceptor returns null/undefined, the event can be dropped/filtered completely
      if (!eventEnvelope) return; 
    }
  }

  // Ship the final, transformed JSON payload to the Backstage UI SSE/WebSocket connection router
  transportStream.push(eventEnvelope);
}
```

### Why This Fulfills the "Complete" Framework Goal

1. **Allows Event Filtering:** By returning `null` or `undefined` inside the transformer, a plugin developer can completely suppress specific event types from streaming to the frontend if they want a quieter UI.
2. **Preserves Core Core Contracts:** Third-party extensions can enrich the frontend capabilities (e.g., a custom UI widget needs a `clusterRegion` key added to `agent:step_enter`) without forcing you to change the fundamental TypeScript schemas inside your core Backstage IDP backend plugin.

## Wins

### 1. Shift from "AI Engineering" to "Productivity Frameworks"

The real power of this framework isn't the AI—it is how the framework **insulates the developer from the chaos of distributed systems**.

- **The Developer Focus:** By wrapping complex systems (like Temporal, OpenTelemetry, data redaction, and Backstage services) behind clean `ctx` properties, developers spend their time writing the core business logic instead of debugging async event states or writing complex retry logic.
- **The Platform Result:** You are providing the engineering organization with a **"Safe Sandbox for Agents."** Developers get the freedom to experiment with complex, iterative agentic pipelines, but the core platform maintains hard constraints over corporate budgets, tenant boundaries, credentials leakage, and API rate limits.
- The Power of "State as the Source of Truth"

In traditional backend software, you build state machines around databases and explicit API routers. In this declarative framework, the **Zod State Schema is the actual orchestrator**.

- Because steps simply accept the state profile, mutate it, and return a delta, your workflows become highly **composable**.
- A team could easily export a collection of standard `.addStep()` handlers as a shared npm package. Another team can import those steps and thread them straight into a completely different workflow without refactoring a single line of backend architecture.
- Creating a Highly Reactive Developer Experience (DX)

Because the pipeline is declared upfront (`addStep`, `addChoice`, `repeatUntil`), your framework knows the layout of the entire workflow before a single line of code runs.

- This unlocks a massive benefit for your **Backstage Frontend UI Plugin**. The UI can parse this structure and immediately display a beautiful outline of the entire pipeline, complete with visual badges for required permissions and external capabilities.
- As the backend streams standard events (`agent:step_enter`, `agent:data_scrubbed`, `agent:parallel_fork_started`), the UI transitions from a static checklist to a real-time, interactive command center. Developers can watch their agent execute, interact with it through forms mid-flight, and review immutable audit paths when it finishes.

## Summary Checklist for Implementation

As your team starts planning the code implementation, you can map your work to **three clean architectural layers**:

1. **The Fluent DSL Layer:** The TypeScript builder class that accumulates steps, choices, interceptors, and hooks into an immutable execution blueprint.
2. **The Temporal Worker Layer:** The engine that translates that blueprint into a state-sourced Temporal workflow, mapping capability calls to activities, managing `autoContinueAsNew` memory checkpoints, and setting up signal wait states.
3. **The Backstage Service Facade Layer:** The curried context object that wraps native platform tools (Catalog, Search, Database, Permissions) into clean, type-safe API calls.

## Cost Controls

### 1. Hardening Cost Controls in the Fluent API

A `.capWorkflowCostAt(amount, currency)` method is entirely feasible because the platform acts as the execution proxy. To make cost control a first-class citizen, the framework can track dollar expenditures in real time by calculating **LLM token usage** (via model pricing metadata maps) and **infrastructure compute time/third-party API costs**.

We can introduce a `.configureFinOps()` block and contextual limits:

```typescript
export const costAwareWorkflow = createAgentWorkflow({ ... })
  .configureFinOps({
    // 1. Hard stopping boundary across the entire Temporal execution tree
    maxWorkflowBudget: { amount: 50.00, currency: 'USD' },

    // 2. Actionable strategy when approaching bounds
    onBudgetAlert: {
      thresholdPercent: 80,
      action: 'escalate-to-approval' // Or 'graceful-abort'
    },

    // 3. Static cost allocations for non-LLM operations
    capabilityCostWeights: {
      'backstage:scaffolder.executeTemplate': 0.25, // Est. infrastructure cost per run
    }
  })
  .addStep('heavyRefinement', async (state, ctx) => {
    // 4. In-flight contextual cost inspection
    const currentSpend = ctx.finops.getCurrentSpend();
    if (currentSpend.amount > 10.00) {
      // Intentionally shift to a cheaper, smaller model dynamically to save budget
      return ctx.goTo('fallbackCheaperModel');
    }
  });
```

How the Framework Enforces This

- **LLM Token Tracking:** Your wrapper around the Vercel AI SDK intercepts the `usage` metrics object returned by the model (`promptTokens`, `completionTokens`). The framework multiplies this by the token rate card for that specific model and increments a thread-safe counter stored in the workflow state.
- **Budget Exhaustion Protection:** Right before the engine enters *any* step handler or invokes *any* capability driver, it checks the accumulated budget. If the budget is exhausted, it throws a `BudgetExhaustionException`, halts forward progress, and cleanly runs the registered `onRollback` compensation sequence to prevent leaving infrastructure in an orphaned state.

## Type Propagation, Monads, and Functional Pipeline Design

How the Types Flow Electronically

Instead of requiring developers to write complex base handler extensions manually for every single node, we can leverage TypeScript's **type inference** to do the work implicitly.

When you define a workflow using `createAgentWorkflow({ stateSchema })`, the builder class locks down that `State` type parameter globally. Every `.addStep()` or `.addChoice()` downstream implicitly receives that exact inferred type block.

```typescript
// The Internal Type Representation of a Handler
export type WorkflowStepHandler<TState, TInput> = (
  state: Readonly<TState>, // State entering the step (Read-Only to preserve determinism!)
  ctx: AgentContext<TInput>
) => Promise<Partial<TState> | void> | Partial<TState> | void; 
// Retuning a Partial<TState> updates specific keys inside the macro memory frame
```

### The Monadic Parallel (Haskell-like Properties)

This fluent pipeline functions almost exactly like a **State Monad** (State → (Output, State)).

- **The Monadic Identity:** In functional programming, a Monad wraps a value, and operations are chained together sequentially using a bind operation, passing the modified inner value down the line cleanly.
- **How it affects your framework design:** To preserve monadic predictability, your engine must enforce a **strict data boundary rule**: *Steps must never directly mutate the state object in place via side effects (e.g., `state.samples.push(item)`).* They must return a brand new state delta dictionary (`return { samples: [...state.samples, item] };`). The core engine acts as the monad controller, cleanly reducing these partial returned frames together into an immutable, versioned transaction log.

## Static Graph Verification and VS Code Developer Hints

Preventing orphan nodes, open loops, or broken edge references is crucial. Relying purely on runtime integration tests means developers only catch syntax typos late in the development cycle. You can validate the topology at **Compile-Time via TypeScript** and **Design-Time via Linters**.

### A. Catching Invalid Paths in VS Code (TypeScript Inference)

You can structure the return signatures of `.addChoice()` so that the TypeScript compiler forces the developer to route only to step names that actually exist in the code file. By using string literal union types (`'observe' | 'analyze' | 'locate'`), the IDE will display a red squiggly line if a developer tries to jump to an undeclared step name.

```typescript
// The return value of the choice function is dynamically typed to the literal names of registered steps
.addChoice('evaluateStatus', (state): 'locate' | 'completeWithoutAction' => {
  return state.score === 'noisy' ? 'locate' : 'completeWithoutAction';
})
```

### B. The Compilation Validation Pass

The moment `workflow.compile()` is executed at backend startup, the engine performs a **Depth-First Search (DFS)** graph validation cycle over the accumulated step configuration schema. Before deploying to production, it verifies:

1. **Connectivity:** Every declared step has an entry point from a prior step or choice.
2. **Termination:** Every path terminates at an explicit `setTerminalOutcome` or an implied end sequence (no infinite loops without exit guards).
3. **Dead Ends:** No choice leads to a string label that isn't mapped to a step handler.

If a validation constraint fails, the engine throws a descriptive build compilation crash displaying a clean structural graph report in the developer terminal.

### 1. Library Choices for DFS Graph Validation

Since your core orchestrator is running inside **Temporal** workflow definitions, you face a strict architectural constraint: **Temporal code must be entirely deterministic** and avoid relying on external Node.js C++ bindings or non-deterministic core libraries.

For the compile-time/boot validation pass, choose one of these two approaches:

- **`ts-graphviz` or `graphlib` (Pure JS)**: `graphlib` is a battle-tested, zero-dependency, pure-JavaScript graph utility library. It provides built-in topological sorting, cycle detection (`alg.isAcyclic`), and search algorithms out of the box. Because it uses no native binaries, it executes safely inside standard runtime environments.
- **Zero-Dependency Custom Script (Recommended)**: Because your fluent API relies on a sequential array of step names punctuated by choices, your graph data structure is simple. A short, pure-TypeScript function (roughly 30 lines) can easily track visited nodes, follow branch destinations, detect cycles, and ensure all paths reach a terminal outcome. This eliminates external supply-chain dependencies entirely and guarantees deterministic execution inside Temporal.

### 2. Hands-Off Validation in VS Code: ESLint & AST Rules

Relying entirely on manual type configuration can be brittle. A developer might change a string inside a handler without updating the associated literal types.

The standard enterprise approach for providing real-time feedback in VS Code is creating a **Custom ESLint Plugin**. This avoids the heavy friction of maintaining a full VS Code extension. ESLint rules hook directly into the IDE via the standard ESLint extension that most developers already have installed.

How an ESLint Rule Validates the Pipeline

Using the `@typescript-eslint/utils` parser, the custom rule walks the Abstract Syntax Tree (AST) of the `.ts` file at design time:

1. It targets any identifier named `createAgentWorkflow`.
2. It tracks the method chain down the AST, collecting all string arguments passed to `.addStep(name)`, `.addChoice(name)`, and `.setTerminalOutcome(name)`.
3. It parses the body of `.addChoice()` or `.goTo()` statements. If it finds a hardcoded string literal return (e.g., `return 'missingStepName'`) that does not exist in the collected step names registry array, it instantly flags the code in VS Code with a squiggly line and a descriptive tool-tip error message: *"Agent Workflow Error: Target step 'missingStepName' is referenced but never declared in the pipeline."*

### 3. Bulletproofing Immutability and Resolving the `any` Type Concern

Let's address the core architectural concern: **ensuring developers cannot accidentally mutate state, and making sure types don't degrade into `any`.**

### A. Is it like Redux?

**Yes, exactly.** Your intuition is entirely correct. The core engine functions precisely like a Redux store wrapper. The developer's step handlers act as *reducers*—they receive the current state snapshot, execute a domain transition, and return a patch delta object. The framework takes that delta and applies a structural merge to compute the next historical state frame.

### B. Programmatic Immutability (Enforcing the Safety Gate)

Leaving immutability up to developer memory is a risk in production environments. You can enforce this programmatically in JavaScript through two distinct approaches:

- **Deep Freezing via Proxies (`Readonly<T>`)**: Before the framework passes the current state object into a developer's step handler, it wraps the state inside a recursive JavaScript **Proxy** configured to reject mutations, or uses `Object.freeze()` recursively in development modes. If a developer attempts to execute a side effect like `state.samples.push(item)`, the runtime will immediately throw a loud, descriptive error *before* the step can proceed, forcing compliant functional behavior.
- **Immer.js Integration**: To make the developer experience seamless, you can adopt the pattern used by modern Redux Toolkit: **Immer**. Instead of forcing developers to write complex destructuring syntax (`return { ...state, samples: [...state.samples, item] }`), you wrap the step invocation inside an Immer `produce` block. Developers can write standard mutable mutations safely, and Immer automatically tracks the changes behind the scenes to generate a pristine, immutable state delta object copy.

### C. Stopping the Type Collapse into `any`

The type system will **never** degrade into `any` if we leverage **TypeScript Generic Mapping**. The type shape does not get wiped out step by step; instead, it is defined once at the very top of the definition block and strictly carried all the way through the builder chain.

Behind the scenes, the types flow by carrying the accumulated schema shape through the builder class signature using generic arguments:

```typescript
export class WorkflowBuilder<
  TState extends z.ZodTypeAny, // Locked from the initial Zod schema
  TInput extends z.ZodTypeAny
> {
  constructor(private meta: { id: string; stateSchema: TState; inputSchema: TInput }) {}

  // TypeScript enforces that 'state' is strictly typed to the Zod schema output shape.
  // The return type is strictly checked as a Partial segment of that identical schema.
  public addStep(
    name: string,
    handler: (
      state: Readonly<z.infer<TState>>, 
      ctx: AgentContext<z.infer<TInput>>
    ) => Promise<Partial<z.infer<TState>> | void> | Partial<z.infer<TState>> | void
  ): this {
    return this;
  }
}
```

Because `z.infer<TState>` extracts the concrete, strongly-typed TypeScript interface directly from the initial Zod runtime configuration schema, the `state` argument inside step 1, step 5, or a conditional choice block maintains its exact shape. The IDE will autocomplete properties perfectly, and any attempt to return an undeclared property key will trigger an immediate type compilation error.

## React Frameworks for Visualizing Pipelines in Backstage

Building a beautiful visual outline tracking nodes, active permissions, and capability blocks is highly effective when leveraging highly tailored diagramming libraries.

For a Spotify Backstage IDP ecosystem, consider these three frontend layout tool choices:

| React Framework | Best Suited For                                              | Why It Fits Your Backstage Context                           |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **React Flow**  | **Highly Interactive Interactive Graphs** *(Highly Recommended)* | The industry standard for custom DAGs. It easily allows you to map your steps into custom styled React components. You can effortlessly render glowing borders for active steps, lock badges for privileged steps, and little capability brand icons (GitHub, AWS) inside the nodes out-of-the-box. |

## Immer

To understand how the framework guarantees **programmatic immutability** while allowing third-party developers to write clean, natural code, we need to trace how the core engine executes step handlers under the hood.

The core engine uses **Immer** to create a safety bubble. Instead of relying on developers to remember complex object-destructuring operators (`{ ...state, nested: { ...state.nested } }`), the execution engine intercepts the state argument, intercepts the return value, and tracks state mutations safely.

### The State Consolidation Lifecycle Loop

Here is the underlying implementation of the core plugin's execution step runner inside a **Temporal Workflow** loop context, illustrating how Immer computes state transitions.

```typescript
import { produce, createDraft, finishDraft } from 'immer';
import { z } from 'zod';

export class WorkflowExecutionEngine {
  
  /**
   * Orchestrates the execution frame of a single step.
   * Ensures perfect read-only isolation and collapses partial changes safely.
   */
  public async executeStepFrame(
    stepName: string,
    handler: Function,
    currentState: Record<string, any>,
    ctx: any
  ): Promise<Record<string, any>> {
    
    // 1. PROGRAMMATIC IMMUTABILITY GATEWAY (Deep Freeze / Read-Only Proxy)
    // Create an immutable, deeply frozen snapshot of the state entering the step.
    // If a developer tries to run `state.property = 'change'`, JavaScript throws an immediate exception.
    const frozenStateInput = produce(currentState, () => {}); 

    // 2. PRE-STEP INTERCEPTOR ENGINE PIPELINE
    for (const interceptor of ctx.interceptors) {
      if (interceptor.onStepEnter) {
        await interceptor.onStepEnter(stepName, frozenStateInput, ctx);
      }
    }

    let returnedDelta: any = {};

    try {
      // 3. THE HANDLER BOUNDARY EXECUTION SWITCH
      // The developer's function runs using the completely frozen state block.
      returnedDelta = await handler(frozenStateInput, ctx);
    } catch (error: any) {
      // If step configurations have fallback logic on retry thresholds (Saga/Emergency rooms)
      return this.handleStepFailure(error, stepName, currentState, ctx);
    }

    // 4. THE MONADIC STATE CONSOLIDATION REDUCER (The Redux Pattern)
    // If the step returned nothing (void), the state remains completely untouched.
    if (!returnedDelta || typeof returnedDelta !== 'object') {
      return currentState;
    }

    // Use Immer to cleanly combine the existing macro state and the developer's partial state delta.
    // This functions exactly like a Redux reducer, producing a brand-new, pristine immutable object record.
    const nextState = produce(currentState, (draftState) => {
      // Safely apply the keys returned in the Partial<TState> delta dictionary
      Object.assign(draftState, returnedDelta);
    });

    // 5. POST-STEP INTERCEPTOR & MUTATION MODIFIERS
    let finalStateFrame = nextState;
    for (const interceptor of ctx.interceptors) {
      if (interceptor.onStepExit) {
        // Interceptors can evaluate the delta and dynamically enrich the final state mapping
        const interceptorDelta = await interceptor.onStepExit(stepName, returnedDelta, ctx);
        finalStateFrame = produce(finalStateFrame, (draft) => {
          Object.assign(draft, interceptorDelta);
        });
      }
    }

    // 6. VOLATILE STATE SCHEMA VERIFICATION
    // Re-verify that the final consolidated memory structure still complies with the registered Zod contract
    const verification = ctx.stateSchema.safeParse(finalStateFrame);
    if (!verification.success) {
      throw new Error(
        `Framework State Corruption Error: Step "${stepName}" returned a delta that broke the structural Zod schema definitions.\n` +
        `Details: ${JSON.stringify(verification.error.format())}`
      );
    }

    // Emits the automated checkpoint state and streams down the SSE network pipeline
    ctx.emitAutomatedCheckpoint(`step_completion:${stepName}`, finalStateFrame);

    return finalStateFrame;
  }

  private handleStepFailure(error: Error, name: string, state: any, ctx: any) {
    // Executes onMaxRetriesExceeded or triggers Saga onRollback undo logic stack...
    throw error;
  }
}
```

### Alternate Advanced Approach: The "Immer Script" Experience

If you want to allow developers to perform straight mutations inside their handlers without copying data (e.g., standard procedural syntax like `state.samples.push(newItem)`), your engine can shift from accepting a `Partial<TState>` delta to using a continuous **Immer Draft**.

By passing an active Immer draft proxy directly into the handler as the first parameter, developers don't have to return anything at all:

```typescript
// Alternate execution runtime option
const nextState = produce(currentState, (draftState) => {
  // The developer manipulates draftState directly inside the handler function.
  // Immer records the mutations behind the scenes and emits a clean immutable object.
  handler(draftState, ctx); 
});
```

However, because your architectural goal is a highly readable **State Monad workflow engine where transitions are explicitly documented step-by-step**, the **Partial Delta approach (Redux-like style)** outlined in the main code block remains the gold standard. It makes tracking, debugging, and viewing what changed in each single step infinitely cleaner on the Backstage frontend dashboard layout.
