import { z } from 'zod';
import { LoggerService } from '@backstage/backend-plugin-api';

// --- Resilience & Performance Architectures ---
export interface WorkflowResilienceConfig {
  initialIntervalSeconds?: number;
  backoffCoefficient?: number;
  maximumAttempts?: number;
  nonRetryableErrors?: string[];
  circuitBreakers?: Record<string, { maxFailures: number; resetTimeoutMinutes: number }>;
}

export interface WorkflowFinOpsConfig {
  maxWorkflowBudget: { amount: number; currency: string };
  thresholdPercent?: number;
  capabilityCostWeights?: Record<string, number>;
}

export interface WorkflowComplianceConfig {
  tenantIsolation: 'strict-logical' | 'shared';
  dataRedaction: { enabled: boolean; rules: string[] };
  retention?: { duration: string; classification: string };
}

export interface WorkflowThrottlingConfig {
  maxConcurrentRunsPerTenant?: number;
  maxLLMTokensPerMinute?: number;
  capabilityRateLimits?: Record<string, { maxInvocationsPerMinute?: number; maxRequestsPerSecond?: number }>;
}

export interface WorkflowStorageConfig {
  historyOptimization?: { autoContinueAsNew: boolean; maxEventsBeforeSnapshot: number };
}

export interface WorkflowVersionConfig {
  currentVersion: number;
  migrations: Record<string, (oldState: any) => any>;
}

// --- Step Configuration Layer ---
export interface StepOptions<TState> {
  timeout?: string;
  retryPolicy?: WorkflowResilienceConfig;
  authorize?: {
    permission: any;
    getAttributes?: (ctx: any) => Record<string, any>;
  };
  onUnauthorized?: 'skip' | 'abort' | {
    strategy: 'escalate-to-approval';
    assignedRole: string;
    prompt: string;
  };
  onRollback?: (state: TState, ctx: any) => Promise<void> | void;
  onMaxRetriesExceeded?: (error: Error, state: TState, ctx: any) => Promise<Partial<TState> | string | void> | Partial<TState> | string | void;
}

export interface ApprovalConfig<TState> {
  prompt: string;
  schema: z.ZodTypeAny;
  onApprove: (approvalData: any, state: TState, ctx: any) => Promise<Partial<TState> | void> | Partial<TState> | void;
  onReject?: (state: TState, ctx: any) => Promise<string | void> | string | void;
}

// --- Dynamic Real-Time Transport Protocols ---
export interface AgentEventEnvelope {
  type: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface WorkflowInterceptor<TState, TInput> {
  onStepEnter?: (stepName: string, state: TState, ctx: AgentContext<TInput, any>) => Promise<void> | void;
  onStepExit?: (stepName: string, stateDelta: Partial<TState>, ctx: AgentContext<TInput, any>) => Promise<Partial<TState>> | Partial<TState>;
  transformEvent?: (event: AgentEventEnvelope, ctx: AgentContext<TInput, any>) => Promise<AgentEventEnvelope | null> | AgentEventEnvelope | null;
}

// --- Comprehensive Curried Backstage Facade Context ---
export interface AgentContext<TInput, THelpers> {
  input: TInput;
  triggerType: 'scheduler' | 'manual';
  userRef: string;
  tenant: { id: string };

  // Custom helper invocation bounds
  helpers: {
    [K in keyof THelpers]: THelpers[K] extends (ctx: any, ...args: infer A) => infer R ? (...args: A) => R : never;
  };

  // Base platform building blocks
  logger: LoggerService;
  config: { getDynamicValue: (key: string, fallback: string) => string };
  telemetry: { trace: <T>(name: string, fn: (span: any) => Promise<T>) => Promise<T> };
  resilience: { runWithRetry: <T>(fn: () => Promise<T>, policy?: WorkflowResilienceConfig) => Promise<T> };
  finops: { getCurrentSpend: () => { amount: number; currency: string } };
  secrets: { getScopedVaultSecret: (opts: { secretPath: string }) => Promise<{ referenceId: string }> };

  // Core Agentic Modules
  ai: {
    generateText: (opts: { prompt: string }) => Promise<string>;
    generateStructuredObject: (opts: { schema: z.ZodTypeAny; prompt: string }) => Promise<any>;
    streamText: (opts: { prompt: string; onChunk?: (chunk: string) => void }) => Promise<void>;
  };

  memory: {
    search: (opts: { query: string; limit?: number; filter?: Record<string, any> }) => Promise<any[]>;
    remember: (opts: { text: string; metadata?: Record<string, any> }) => Promise<void>;
  };

  compliance: { attest: (opts: { action: string; reasoning: string; evidenceRefs: string[] }) => void };

  // Asynchronous Interaction Framework
  interaction: {
    askUser: (opts: { title: string; prompt: string; schema: z.ZodTypeAny }) => Promise<any>;
    inspectAndMutateState: (opts: { message: string; mutableFields: string[] }) => Promise<any>;
    adminOverrideCatch: (opts: { error: string; actions: string[] }) => Promise<{ action: string }>;
  };

  webhooks: {
    createCallbackUrl: (opts: { allowedSource: string; expiresIn: string }) => Promise<string>;
    waitForPayload: () => Promise<any>;
  };

  // --- Exposed Native Backstage Feature Primitives ---
  catalog: {
    getEntity: (ref: string) => Promise<any>;
    getOwner: (ref: string) => Promise<any>;
    getSystemDependencies: (systemId: string) => Promise<any[]>;
  };

  search: {
    query: (text: string, options: { kinds?: string[] }) => Promise<any[]>;
  };

  notifications: {
    send: (targetRef: string, content: any) => Promise<void>;
    requestAction: (targetRef: string, responseSchema: any) => Promise<any>;
  };

  identity: {
    getIdentityCredentials: () => Promise<any>;
    onBehalfOf: <T>(userRef: string, block: () => Promise<T>) => Promise<T>;
  };

  // --- Native Backend Plumbing Services ---
  cache: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: (key: string, value: any, ttlMs?: number) => Promise<void>;
  };

  urlReader: {
    readUrl: (url: string) => Promise<Buffer>;
  };

  db: {
    getClient: () => Promise<any>; // Knex instance proxy
  };

  scheduler: {
    scheduleTask: (config: any) => Promise<void>;
  };

  discovery: {
    getBaseUrl: (pluginId: string) => Promise<string>;
  };

  userInfo: {
    getUserInfo: (token: string) => Promise<any>;
  };

  lifecycle: {
    addShutdownHook: (hookFn: () => Promise<void>) => void;
  };

  plugin: {
    getId: () => string;
  };

  // --- 1. THE MODERN AUTH SERVICE FACADE ---
  // Replaces legacy identity tokens to securely sign plugin-to-plugin request payloads.
  auth: {
    /** Generates a cryptographically signed back-to-back token representing this agent process */
    getPluginRequestToken: (opts: { targetPluginId: string }) => Promise<{ token: string }>;
    /** Validates an incoming token wrapper signature from a neighboring plugin hook */
    getPrincipal: (token: string) => Promise<any>;
  };

  // --- 2. ROOT HEALTH SERVICE ASSURANCE CONTROL ---
  // Lets the agent communicate its real-time internal stability metrics straight to pod probes.
  health: {
    /** Forcefully flags the container as unhealthy to Kubernetes if an agent loop stalls fatally */
    flagLivenessFailure: (reason: string) => void;
  };
}
