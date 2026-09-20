import { z } from 'zod';
import {
  StepOptions,
  ApprovalConfig,
  WorkflowInterceptor,
  WorkflowResilienceConfig,
  WorkflowFinOpsConfig,
  WorkflowComplianceConfig,
  WorkflowThrottlingConfig,
  WorkflowStorageConfig,
  WorkflowVersionConfig,
  AgentContext
} from './_WorkflowBuilder-types';

export class WorkflowBuilder<
  TStateSchema extends z.ZodTypeAny,
  TInputSchema extends z.ZodTypeAny,
  THelpers extends Record<string, (ctx: any, ...args: any[]) => any> = {}
> {
  // Operational step definitions tracking pipelines
  private steps: Array<{ type: string; name: string; target: any; options?: any }> = [];
  private stepHandlers = new Map<string, Function>();
  private stepOptionsMap = new Map<string, StepOptions<z.infer<TStateSchema>>>();
  private choicesMap = new Map<string, (state: z.infer<TStateSchema>, ctx: any) => string>();
  private outcomesMap = new Map<string, Function>();
  private interceptors: Array<WorkflowInterceptor<z.infer<TStateSchema>, z.infer<TInputSchema>>> = [];
  private extensions: Array<any> = [];

  // System configurations
  private registeredHelpers: THelpers = {} as THelpers;
  private resilienceConfig?: WorkflowResilienceConfig;
  private finopsConfig?: WorkflowFinOpsConfig;
  private complianceConfig?: WorkflowComplianceConfig;
  private throttlingConfig?: WorkflowThrottlingConfig;
  private storageConfig?: WorkflowStorageConfig;
  private versionConfig?: WorkflowVersionConfig;

  constructor(private meta: { id: string; stateSchema: TStateSchema; inputSchema: TInputSchema }) {}

  /** Binds functional utilities directly inside step execution scopes */
  public useHelpers<TNewHelpers extends Record<string, (ctx: any, ...args: any[]) => any>>(
    helpers: TNewHelpers
  ): WorkflowBuilder<TStateSchema, TInputSchema, TNewHelpers> {
    this.registeredHelpers = helpers as any;
    return this as any;
  }

  /** Registers global event and step interceptor hooks */
  public addInterceptor(interceptor: WorkflowInterceptor<z.infer<TStateSchema>, z.infer<TInputSchema>>): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /** Registers an external decorator plugin extension payload */
  public extend(extensionPlugin: any): this {
    this.extensions.push(extensionPlugin);
    if (extensionPlugin.onStepAdd) {
      extensionPlugin.onStepAdd(this);
    }
    return this;
  }

  // --- Pipeline Lifecycle Configuration Blocks ---
  public configureResilience(config: WorkflowResilienceConfig): this { this.resilienceConfig = config; return this; }
  public configureFinOps(config: WorkflowFinOpsConfig): this { this.finopsConfig = config; return this; }
  public configureCompliance(config: WorkflowComplianceConfig): this { this.complianceConfig = config; return this; }
  public configureThrottling(config: WorkflowThrottlingConfig): this { this.throttlingConfig = config; return this; }
  public configureStorage(config: WorkflowStorageConfig): this { this.storageConfig = config; return this; }
  public configureVersion(config: WorkflowVersionConfig): this { this.versionConfig = config; return this; }

  // --- Standard Pipeline Control Methods ---
  public addStep(
    name: string,
    handler: (state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => Promise<Partial<z.infer<TStateSchema>> | void> | Partial<z.infer<TStateSchema>> | void,
    options?: StepOptions<z.infer<TStateSchema>>
  ): this {
    this.steps.push({ type: 'step', name, target: handler, options });
    this.stepHandlers.set(name, handler);
    if (options) this.stepOptionsMap.set(name, options);
    return this;
  }

  public addStreamingStep(
    name: string,
    handler: (state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => Promise<Partial<z.infer<TStateSchema>> | void> | Partial<z.infer<TStateSchema>> | void,
    options?: StepOptions<z.infer<TStateSchema>>
  ): this {
    this.steps.push({ type: 'step', name, target: handler, options: { ...options, isStreaming: true } });
    this.stepHandlers.set(name, handler);
    return this;
  }

  public addChoice(
    name: string,
    router: (state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => string
  ): this {
    this.steps.push({ type: 'choice', name, target: router });
    this.choicesMap.set(name, router);
    return this;
  }

  public setTerminalOutcome(
    name: string,
    handler: (state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => Promise<void> | void
  ): this {
    this.outcomesMap.set(name, handler);
    return this;
  }

  // --- Advanced Logical & Compliance Branching ---

  /** Declares an explicit visual or administrative milestone progress savepoint */
  public checkpoint(name: string): this {
    this.steps.push({ type: 'checkpoint', name, target: null });
    return this;
  }

  /** Halts processing loops safely waiting for custom asynchronous approvals */
  public requireApproval(name: string, config: ApprovalConfig<z.infer<TStateSchema>>): this {
    this.steps.push({ type: 'approval', name, target: config });
    return this;
  }

  /** Mounts an asynchronous webhook callback signal checkpoint boundary */
  public waitForSignal(
    name: string,
    config: {
      timeout: string;
      matchCondition: (signalPayload: any, state: Readonly<z.infer<TStateSchema>>) => boolean;
      onSuccess: (signalPayload: any, state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => Promise<Partial<z.infer<TStateSchema>>> | Partial<z.infer<TStateSchema>>;
      onTimeout: (state: Readonly<z.infer<TStateSchema>>, ctx: AgentContext<z.infer<TInputSchema>, THelpers>) => Promise<string | void> | string | void;
    }
  ): this {
    this.steps.push({ type: 'signal-wait', name, target: config });
    return this;
  }

  /** Spawns isolated execution pipelines running across multiple array records concurrently */
  public addParallelForEach(
    name: string,
    config: {
      iterator: (state: Readonly<z.infer<TStateSchema>>) => any[];
      pipeline: (subBuilder: WorkflowBuilder<TStateSchema, TInputSchema, THelpers>) => void;
    }
  ): this {
    const subBuilder = new WorkflowBuilder(this.meta).useHelpers(this.registeredHelpers);
    config.pipeline(subBuilder as any);
    this.steps.push({ type: 'parallel-loop', name, target: { iterator: config.iterator, compiledPipeline: subBuilder.compile() } });
    return this;
  }

  /** Embeds a cyclic step pipeline iteration sequence loop */
  public repeatUntil(
    name: string,
    config: {
      condition: (state: Readonly<z.infer<TStateSchema>>) => boolean;
      pipeline: (subBuilder: WorkflowBuilder<TStateSchema, TInputSchema, THelpers>) => void;
    }
  ): this {
    const subBuilder = new WorkflowBuilder(this.meta).useHelpers(this.registeredHelpers);
    config.pipeline(subBuilder as any);
    this.steps.push({ type: 'loop', name, target: { condition: config.condition, compiledLoop: subBuilder.compile() } });
    return this;
  }

  /** Resolves multi-hypothesis path simulations, reducing branches down to a merge logic gate */
  public addHypothesisFork(
    name: string,
    config: {
      branches: Record<string, (subBuilder: WorkflowBuilder<TStateSchema, TInputSchema, THelpers>) => void>;
      merge: (branchResults: Record<string, z.infer<TStateSchema>>, currentState: Readonly<z.infer<TStateSchema>>) => Partial<z.infer<TStateSchema>>;
    }
  ): this {
    const compiledBranches: Record<string, any> = {};
    for (const [branchId, pipelineFn] of Object.entries(config.branches)) {
      const subBuilder = new WorkflowBuilder(this.meta).useHelpers(this.registeredHelpers);
      pipelineFn(subBuilder as any);
      compiledBranches[branchId] = subBuilder.compile();
    }
    this.steps.push({ type: 'fork', name, target: { branches: compiledBranches, mergeFn: config.merge } });
    return this;
  }

  /** Compiles definitions and triggers static analysis checking */
  public compile() {
    const compiledObject = {
      id: this.meta.id,
      stateSchema: this.meta.stateSchema,
      inputSchema: this.meta.inputSchema,
      steps: this.steps,
      handlers: this.stepHandlers,
      options: this.stepOptionsMap,
      choices: this.choicesMap,
      outcomes: this.outcomesMap,
      interceptors: this.interceptors,
      extensions: this.extensions,
      resilience: this.resilienceConfig,
      finops: this.finopsConfig,
      compliance: this.complianceConfig,
      throttling: this.throttlingConfig,
      storage: this.storageConfig,
      version: this.versionConfig,
      helpers: this.registeredHelpers,
    };

    this.verifyTopologySafety(compiledObject);
    return compiledObject;
  }

  private verifyTopologySafety(graph: any): void {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const checkNode = (nodeName: string) => {
      if (stack.has(nodeName)) {
        throw new Error(`Framework Boot Failure: Acyclic verification check failed. Infinite processing loop detected at node: "${nodeName}"`);
      }
      if (visited.has(nodeName)) return;

      stack.add(nodeName);
      stack.delete(nodeName);
      visited.add(nodeName);
    };

    for (const step of graph.steps) {
      if (step.type === 'step') checkNode(step.name);
    }
  }
}

export function createAgentWorkflow<TStateSchema extends z.ZodTypeAny, TInputSchema extends z.ZodTypeAny>(meta: {
  id: string;
  stateSchema: TStateSchema;
  inputSchema: TInputSchema;
}) {
  return new WorkflowBuilder(meta);
}
