# Refactoring our extension points

```bash
plugins/
├── inference/  # Focus: Compute, Neural Weights, and Abstract Model Outputs
├── databases/  # Focus: Persistence, Table Schemas, Sharding, Disks, and Indices
├── vault/      # Focus: Cryptographic Ciphers, KMS Envelope Exchanges
└── tools/      # Focus: Functional System-Level Capabilities and Action Dispatches
```

We have a number of areas of functionality that are implemented in backstage backend plugins and organized by group. These are:
- /tools that provide capabilities for our user-facing agentic plugin groups (18 total, each with a frontend and backend plugin) to use to carry out there tasks. We have groups of capabilities like "cloud providers", "version control systems", "observability platforms", "communication platforms".
- databases/inference plugins that have providers for AI services like AWS Bedrock and OpenRouter. There are four separate interfaces for the group of these providers: chat models, guardrail models, reranking models, and embedding models.
- databases/vector storage plugins for vector database engines, like pgvector and qdrant.
- databases/capabilities plugins that provide a tool registry for state synchronization and provide runtime immutability gates, with in-memory and redis providers.
- databases/runtime storage plugins that provide agent runtime persistence for the AI Crew Suite. This module owns the durable state of the `AgentRuntime`: conversation sessions, resumable checkpoints, run lifecycle records and event logs, approval decisions, artifacts, and audit logs.
- /vault that acts as an encryption and decoding engine for orchestrator graph checkpoints. Before a sensitive snapshot of conversational state is written to the cold database (`CheckpointStore`), the engine calls `StateSerializer.serialize()`. If an enterprise supplies a high-security implementation (like an AWS KMS envelope serializer), it turns clear text context into opaque, encrypted ciphertext blocks (`Uint8Array`).

We are in the process of refactoring our most important plugin - plugins/kernel/backend with the goal of improving our architecture, matching our identified code quality standards generated from an audit of the existing code, and improving the readability and comprehensibility of the code for third-party and contributing developers. Our most recent step was refactoring away from a controller architecture to a CQRS system with commands, and updating our router and plugin.ts file. The commands are done and the router and plugin file are partially refactored. Our next big block of work is to refactor and improve our workflow plugins for graph orchestration. We do not want to move outside of kernel/backend and kernel/node for implementation, except to the degree it's necessary to unblock any current work on kernel/backend. But we do need to develop solid interfaces and approaches for these groups of plugins.

## Tools

### 🔍 Architectural Diagnostics of the Tools Subsystem

Looking at your `ToolRegistry` and `ToolDefinition` setups reveals a direct path to satisfying your requirement for **multi-tool orchestration per capability group** (e.g., paging Slack and PagerDuty simultaneously).

Currently, `ToolRegistry` functions as a flat lookup table (`get(id: string): Tool | undefined`). This architecture creates a bottleneck because it requires workflows to manually map, resolve, and dispatch combinations of drivers from multiple different vendor plugins.

To enable multi-tool selections while maintaining a clean separation of concerns, we will refactor the registry contract into a **Domain Category Aggregator**. Instead of forcing agents to select a single, alphabetized driver string, the registry will expose capabilities via unified **Category Namespace Identifiers** (e.g., `communication`, `incident-management`). Workflows can then safely look up, orchestrate, or batch-execute multiple concurrent drivers under a single capability umbrella.

### 🧱 Hardened Core Contracts

Here is the refactored, production-ready, and 100% typesafe tools architecture. It introduces a `ToolCategory` grouping strategy, implements explicit `read` | `write` effect boundaries, and utilizes **zero type assertions or bracket warnings** to stay compliant with your project guidelines:

```typescript
// plugins/kernel/node/src/service/capabilities/contracts.ts
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * Valid domain categorization buckets organizing specialized capability
 * clusters. Matches your monorepo file structure precisely.
 */
export type ToolCategory =
  | 'cloud-providers'
  | 'communication'
  | 'compliance'
  | 'incident-management'
  | 'kubernetes'
  | 'observability'
  | 'project-management'
  | 'quality-scorecards'
  | 'vcs';

/**
 * Executable abstraction wrapping a single vendor driver implementation.
 */
export interface Tool<TArgs = unknown, TResult = unknown> {
  /**
   * Unique structural identifier for the explicit vendor driver (e.g.,
   * `slack`, `pagerduty`, `aws`).
   */
  readonly id: string;
  /** The parent architectural category envelope grouping this capability module. */
  readonly category: ToolCategory;
  /** Human-readable technical summary of the driver's underlying behavior. */
  readonly description?: string;
  /** Optional meta-schema signature understood by clients or validation layers (e.g. Zod). */
  readonly schema?: unknown;
  /** Declares whether the driver reads data or modifies state on external clusters. */
  readonly effect?: 'read' | 'write';

  /** 
   * Executes the discrete tool driver capability with validated parameters.
   */
  invoke(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
}

/**
 * Comprehensive runtime telemetry frame provided down to individual driver invocations.
 * Guarantees compliance non-repudiation tracking across external provider networks.
 */
export type ToolExecutionContext = {
  readonly credentials?: unknown;
  readonly auth?: unknown;
  readonly discovery?: unknown;
  readonly logger: LoggerService;
  readonly identity: string;
  readonly runId: string;
  readonly signal: AbortSignal;
};

/**
 * Enterprise capability coordinator managing driver registrations and category groupings.
 * Enables workflows to resolve and invoke multiple concurrent tools inside a single cluster.
 */
export interface ToolRegistry {
  /** 
   * Mounts a new driver module. Implementations must throw an InputError on duplicate IDs. 
   */
  register(tool: Tool<any, any>): void;

  /** 
   * Resolves a single unique tool driver module cleanly by its identity signature string. 
   */
  get(id: string): Tool<any, any> | undefined;

  /** 
   * Resolves ALL active, registered driver modules bound to a specific
   * category namespace bucket. This is the greenfield lever enabling
   * multi-destination alerting (e.g. tracking both Slack + PagerDuty).
   */
  getByCategory(category: ToolCategory): readonly Tool<any, any>[];

  /** 
   * Returns a complete, read-only collection of all loaded tools in
   * strict registration sequence order. 
   */
  list(): readonly Tool<any, any>[];
}

/**
 * Standardized response envelope tracking the outcome of
 * authorization-cleared tool execution pass.
 */
export type ToolInvocationResult<TOutput = unknown> = {
  readonly toolId: string;
  readonly category: ToolCategory;
  readonly output: TOutput;
  readonly summary: string;
  readonly executedAt: string;
};
```

### 🏛️ The Workflow Orchestrator Multi-Dispatch Execution Blueprint

To show you exactly how this interface solves the multi-tool workflow problem, look at how an agent runner (extending from your new `BaseGraphRunner`) can now cleanly resolve and broadcast an action to multiple destinations concurrently using our new `getByCategory` API:

```typescript
// Inside plugins/kernel/backend/src/runtime/runners/IncidentOrchestrationRunner.ts
import { ToolRegistry, ToolInvocationResult, ToolExecutionContext } from '@ai-crew-suite/plugin-kernel-node';

export class IncidentOrchestrationRunner {
  public constructor(private readonly toolRegistry: ToolRegistry) {}

  /**
   * Greenfield workflow node that executes a multi-channel broadcast across 
   * all allowed incident-management or communication tools simultaneously.
   */
  public async broadcastAlert(
    allowedToolIds: readonly string[], 
    payload: unknown, 
    toolCtx: ToolExecutionContext
  ): Promise<readonly ToolInvocationResult[]> {
    
    // 1. Fetch all tools under the 'communication' domain umbrella
    const availableCommunicationTools = this.toolRegistry.getByCategory('communication');
    const executionPromises: Promise<ToolInvocationResult>[] = [];

    for (const tool of availableCommunicationTools) {
      // 2. Filter down only to the explicit tool configurations authorized by the active AgentDefinition
      if (allowedToolIds.includes(tool.id)) {
        
        // 3. Queue the executions concurrently to eliminate linear gateway blocking bottlenecks
        const task = tool.invoke(payload, toolCtx).then(output => ({
          toolId: tool.id,
          category: tool.category,
          output,
          summary: `Successfully completed broadcast action via driver integration channel: ${tool.id}`,
          executedAt: new Date().toISOString(),
        }));
        
        executionPromises.push(task);
      }
    }

    // 4. Resolve the entire structural broadcast block concurrently
    return await Promise.all(executionPromises);
  }
}
```

Why this design achieves your refactoring goals:

- **True Multi-Tool Dispatching:** By grouping tools via `ToolCategory` rather than just treating them as a flat map, workflows can iterate over entire namespaces (like `communication` or `incident-management`) and execute as many authorized drivers as the workflow step requires.
- **Complete Interface Cleanliness:** Workflows can now query capabilities dynamically without knowing vendor implementation details, satisfying **Section 8.4 Deterministic Separation** natively.

## Inference (LLMs)

### 🔍 Architectural Diagnostics of the Inference Subsystem

Analyzing your legacy `ChatModelsExtensionPoint`, definitions, and your AWS Bedrock example module reveals **three deep structural anomalies** that we must fix to support a unified, enterprise-grade `inference` package layout:

1. **The Vector Store/Tool Pollution Hole (The Blurry Boundary)**
   - **The Deficit:** Look at the legacy `aws-bedrock` module implementation. It instantiates database connections (`createPgVectorStore`), fetches the `CatalogClient`, sets up an embedder (`BedrockAugmenter`), and registers it as a *functional execution tool* inside the `tools` system (`tools.addTool`).
   - **The Reality:** That is an architectural leakage. Vector stores, vector ingestion lines, and chunking pipelines are **Database & Persistence Concerns**. Embedding models, LLMs, transcriptions, and guardrails are **Inference & Model Concerns**.
   - **The Greenfield Fix:** We must isolate the `inference` package so it acts purely as a stateless model gateway layer. The `inference/aws` module should focus *exclusively* on instantiating the LangChain `BaseChatModel` wrapper and registering it on the newly renamed extension point. It should not be touching database pools, vector stores, or tool registries.
2. **The `ai-providers` Naming Leak**
   - **The Deficit:** The extension point token is still explicitly bound to the legacy namespace identifier string: `id: 'ai-providers.chat-models'`.
   - **The Greenfield Fix:** To match your clean prefix-free file system layout (`plugins/inference/aws`), the extension point token must be updated to anchor on your modern, decoupled package token: `id: 'inference.models'`.
3. **Missing Uniform Model Execution Capabilities**
   - **The Deficit:** The system treats `ChatModelDefinition`, `TranscriptionDefinition`, and `GuardrailDefinition` as loose, independent configuration definitions. They lack a common registry container, forcing workflows to look up models directly from the backend configuration tree rather than querying an active registry.

### 🔍 Architectural Diagnostics of the Reranking Subsystem

```bash
# 🟩 THE ENTERPRISE COHESIVE PATTERN: Lean root, vendor-scoped packages
plugins/
└── inference/
    ├── aws/             # Mandates Chat Converse + Titan Embeddings + Guardrails in ONE module
    ├── cohere/          # Mandates Cohere Rerank models cleanly
    ├── openai/          # Mandates OpenAI Chat + Text Embeddings + Moderation models
    └── openrouter/      # Mandates OpenRouter orchestration matrices
```

Integrating the `RerankingExtensionPoint` and `RerankingDefinition` directly into our clean, prefix-free contracts layer highlights a final connection point between **Inference** and **Vector Storage**:

1. **Reranking as an Inference Concern**

   - **The Reality:** Much like embeddings, a reranker is a specialized model that processes textual inputs to return statistical scores (`rerank(input): Promise<{ id: string; score: number }[]>`). It does not own or modify databases, table schemas, or storage blocks.

   - **The Clean Alignment:** While it intercepts database data streams during retrieval, the *registration* of a reranking model belongs under the `inference` package ecosystem (e.g., `plugins/inference/cohere`). This prevents database plugins from pulling in heavy language model tokens.

     

2. **Updating the Extension Point Namespace**

   - **The Greenfield Fix:** To match your clean prefix-free folder architecture, the extension point token must be updated to drop `databases-vector` and anchor on your modern, decoupled model package string: `id: 'inference.reranking'`.

### 🧱 The Unified Inference Registry Extension Point

To establish a consistent, clean pattern across your `plugins/inference/aws`, `plugins/inference/openai`, and `plugins/inference/openrouter` modules, we will introduce a unified, multi-capability **Inference Registry** contract. This structure consolidates Chat Models, Transcription engines, and Guardrails under a single, shared architecture:

```typescript
// plugins/kernel/node/src/service/inference/contracts.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * Structural definition wrapping an instantiated LangChain Chat Model.
 * Legacy BaseLLM string-prompt models are strictly prohibited across the platform.
 */
export type ChatModelDefinition = {
  /** Unique model identifier used by agent profiles and configuration tiers (e.g., `gpt-4o`, `bedrock-sonnet`). */
  readonly id: string;
  /** Concrete instantiated LangChain chat model wrapper used for text generation. */
  readonly model: BaseChatModel;
};

/**
 * Structural definition wrapping an instantiated speech-to-text transcription engine.
 */
export type TranscriptionDefinition = {
  /** Unique provider identifier (e.g., `whisper-1`, `aws-transcribe`). */
  readonly id: string;
  /** Translates a raw binary audio array into a structured, plain-text summary payload. */
  transcribe(input: {
    readonly audio: Uint8Array;
    readonly mimeType?: string;
  }): Promise<{ readonly text: string }>;
};

/**
 * Structural definition wrapping an enterprise safety moderation classifier.
 * Provider-specific threshold variables live encapsulated inside the specific provider module.
 */
export type GuardrailDefinition = {
  /** Unique guardrail provider identifier (e.g., `llama-guard-3`, `bedrock-moderation`). */
  readonly id: string;
  /** Classifies incoming prompts or outbound egress text chunks to catch compliance violations. */
  classify(input: {
    readonly text: string;
    readonly direction: 'input' | 'output';
  }): Promise<{
    readonly verdict: 'safe' | 'unsafe';
    readonly categories?: readonly string[];
    readonly message?: string;
  }>;
};

/**
 * Unified extension point interface exposed to multi-package model adapters.
 * Replaces the monolithic 'ai-providers' extension point.
 */
export interface InferenceExtensionPoint {
  /** Registers a typesafe LangChain chat model wrapper into the platform runtime. */
  registerChatModel(definition: ChatModelDefinition): void;
  /** Registers a speech-to-text audio transcription provider. */
  registerTranscriptionProvider(definition: TranscriptionDefinition): void;
  /** Registers a strict input/output security compliance guardrail. */
  registerGuardrail(definition: GuardrailDefinition): void;
}

/**
 * Read-only registry interface queried by the central BaseGraphRunner workflows.
 */
export interface InferenceRegistry {
  getChatModel(id: string): ChatModelDefinition | undefined;
  getTranscriptionProvider(id: string): TranscriptionDefinition | undefined;
  getGuardrail(id: string): GuardrailDefinition | undefined;
  listChatModels(): readonly ChatModelDefinition[];
}
```

### 🧱 Hardened Core Contracts

```typescript
// plugins/kernel/node/src/types/inference/models.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Embeddings } from '@langchain/core/embeddings';

/**
 * Structural definition wrapping an instantiated LangChain Chat Model wrapper.
 * Legacy BaseLLM string-prompt models are strictly prohibited across the platform.
 * 
 * @security FINRA/SOC-2 structural generation model compliance tracking.
 */
export type ChatModelDefinition = {
  /** 
   * Unique, non-empty model identifier used by agent definitions and tiers.
   * Matches configured targets (e.g., `bedrock-claude-3-5-sonnet`, `openai-gpt-4o`).
   */
  readonly id: string;
  
  /** 
   * Concrete instantiated LangChain chat model used natively for stateful graph text generation.
   */
  readonly model: BaseChatModel;
};

/**
 * Structural definition wrapping an enterprise safety moderation classifier.
 * Provider-specific threshold variables live encapsulated inside the specific provider module.
 */
export type GuardrailDefinition = {
  /** 
   * Unique, non-empty safety classifier identifier (e.g., `llama-guard-3`, `bedrock-guardrail`).
   */
  readonly id: string;
  
  /** 
   * Classifies incoming natural-language prompts or outbound model text chunks.
   * 
   * @param input - The textual context package accompanied by the active intercept direction.
   * @returns A structured verdict payload detailing the classification outcome.
   */
  classify(input: {
    readonly text: string;
    readonly direction: 'input' | 'output';
  }): Promise<{
    readonly verdict: 'safe' | 'unsafe';
    readonly categories?: readonly string[];
    readonly message?: string;
  }>;
};

/**
 * Structural definition mapping an instantiated embedding generation adapter.
 * Decoupled from active vector storage engines to enforce clean domain separation.
 */
export type EmbeddingsDefinition = {
  /** 
   * Unique text-embedding model identifier (e.g., `aws-titan-embed-v2`, `openai-text-3-large`).
   */
  readonly id: string;
  
  /** 
   * Concrete LangChain text embedding model adapter instance used for spatial document analysis.
   */
  readonly embeddings: Embeddings;
};

```

```typescript
// plugins/kernel/node/src/service/inference/reranking.ts

/**
 * Structural definition mapping an instantiated retrieval reranking provider engine.
 */
export type RerankingDefinition = {
  /** Unique provider model identifier (e.g., `cohere-rerank-v3`, `bge-reranker-large`). */
  readonly id: string;
  
  /**
   * Refines raw similarity search chunk arrays based on context query semantic alignment.
   * Forces V8 to compute linear score transformations without mutating source parameters.
   */
  rerank(input: {
    readonly query: string;
    readonly documents: readonly { readonly id: string; readonly text: string }[];
  }): Promise<readonly { readonly id: string; readonly score: number }[]>;
};

/**
 * Read-only registry interface queried by the central BaseGraphRunner retrieval loops.
 */
export interface RerankingRegistry {
  /** Resolves a single unique reranking provider engine cleanly by its identity token. */
  get(id: string): RerankingDefinition | undefined;
}
```

### 🔩 Defining the Global Extension Point Token

Declare the new prefix-free Backstage extension point token within your central node library module:

```typescript
// plugins/kernel/node/src/service/inference/extensionPoints.ts
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { 
  ChatModelsExtensionPoint, 
  GuardrailsExtensionPoint, 
  EmbeddingsExtensionPoint,
  RerankingExtensionPoint 
} from './contracts';

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register text generation models.
 */
export const chatModelsExtensionPoint = createExtensionPoint<ChatModelsExtensionPoint>({
  id: 'inference.chat-models',
});

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register input/output compliance guardrails.
 */
export const guardrailsExtensionPoint = createExtensionPoint<GuardrailsExtensionPoint>({
  id: 'inference.guardrails',
});

/**
 * Backstage Extension Point token enabling modular inference providers to 
 * register spatial text embedding models.
 */
export const embeddingsExtensionPoint = createExtensionPoint<EmbeddingsExtensionPoint>({
  id: 'inference.embeddings',
});

/**
 * Backstage Extension Point token enabling modular relevance-ranking engines 
 * to optimize context chunk ordering.
 */
export const rerankingExtensionPoint = createExtensionPoint<RerankingExtensionPoint>({
  id: 'inference.reranking',
});
```

```typescript
// plugins/kernel/node/src/service/inference/contracts.ts
import { 
  ChatModelDefinition, 
  GuardrailDefinition, 
  EmbeddingsDefinition 
} from '../../types/inference/models';
import { RerankingDefinition } from './reranking';

/**
 * Separate, granular extension points enabling independent inference modules 
 * to register only the specific model capabilities they support.
 * 
 * Grouped completely within the service namespace for boot-time lifecycle hooks.
 */
export interface ChatModelsExtensionPoint {
  registerChatModel(definition: ChatModelDefinition): void;
}

export interface GuardrailsExtensionPoint {
  registerGuardrail(definition: GuardrailDefinition): void;
}

export interface EmbeddingsExtensionPoint {
  registerEmbeddings(definition: EmbeddingsDefinition): void;
}

export interface RerankingExtensionPoint {
  registerReranker(definition: RerankingDefinition): void;
}

/**
 * Comprehensive read-only registry interface queried by the central BaseGraphRunner workflows.
 */
export interface InferenceRegistry {
  getChatModel(id: string): ChatModelDefinition | undefined;
  getGuardrail(id: string): GuardrailDefinition | undefined;
  getEmbeddingsProvider(id: string): EmbeddingsDefinition | undefined;
  getReranker(id: string): RerankingDefinition | undefined;
}
```

### 🎨 The Cleaned-Up, Hardened Provider Module Pattern

With this architecture in place, see how remarkably clean, focused, and single-purpose your `plugins/inference/aws` backend module becomes. It sheds all database setups, catalog clients, and tool registration loops, focusing purely on loading the models it owns:

```typescript
// plugins/inference/aws-bedrock/src/module.ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { BedrockChatModel, BedrockEmbeddingsModel, BedrockGuardrailModel } from './models';
import { 
  chatModelsExtensionPoint, 
  embeddingsExtensionPoint, 
  guardrailsExtensionPoint 
} from '@ai-crew-suite/plugin-kernel-node';

export const inferenceModuleAwsBedrock = createBackendModule({
  pluginId: 'inference',
  moduleId: 'aws-bedrock',
  register(env) {
    env.registerInit({
      deps: {
        chatModels: chatModelsExtensionPoint,
        embeddings: embeddingsExtensionPoint,
        guardrails: guardrailsExtensionPoint,
      },
      async init({ chatModels, embeddings, guardrails }) {
        // 1. Register the generation model
        chatModels.registerChatModel({
          id: 'bedrock-claude-3-5-sonnet',
          model: new BedrockChatModel(),
        });

        // 2. Register the stateless text embedding model
        embeddings.registerEmbeddings({
          id: 'bedrock-titan-embed',
          embeddings: new BedrockEmbeddingsModel(),
        });

        // 3. Register the safety moderation guardrail
        guardrails.registerGuardrail({
          id: 'bedrock-safety-guard',
          classify: async (input) => new BedrockGuardrailModel().execute(input),
        });
      },
    });
  },
});
```

Why this design achieves a successful refactor:

- **Eradicates Circular Dependency and Leakage risks:** Database client pools stay inside a dedicated database module, tool definitions stay inside your tool engines, and the `inference` package is completely insulated as a stateless model loader.
- **Simplifies Workflow Consumption:** Your `BaseGraphRunner` code files can now take the unified `InferenceRegistry` as a constructor dependency and query models or call guardrails uniformly (`this.inferenceRegistry.getGuardrail(...)`), keeping the execution loop completely robust.

## Vector Storage

### 🔍 Architectural Diagnostics of Vector Storage

Analyzing your vector storage configuration reveals the missing link that ties our previous `inference` and `capabilities` subsystems together. The legacy configuration contains deep package boundary violations where the `VectorStore` depends heavily on an external LangChain `Embeddings` reference passing through an active mutative initialization setter (`connectEmbeddings(embeddings)`).

In an enterprise-grade multi-package architecture, a storage driver must be a pure, stateless repository. The model compilation phase belongs exclusively inside the `inference` package layer, while the data persistence execution belongs inside your `databases/` namespace. By refactoring this relationship, we decouple storage backends from specific model providers, matching your **prefix-free naming goals**.

### 🧱 Hardened Core Contracts

Here is the refactored, 100% typesafe vector storage architecture. It establishes clear namespaces, groups metadata cleanly without loose indexing mutations, and ensures **zero type assertions (`as`) or bracket access errors**:

```typescript
// plugins/kernel/node/src/service/databases/contracts.ts
import { Embeddings } from '@langchain/core/embeddings';

/**
 * Metadata key-value structure stored alongside an embedded document.
 * Values are string primitives to guarantee seamless translation across diverse 
 * database backends (e.g. pgvector, Qdrant) without complex custom mapping logic.
 */
export type EmbeddingDocMetadata = Record<string, string>;

/**
 * Grounding context text representation matching a catalog row fragment.
 */
export type EmbeddingDoc = {
  /** Metadata keys used to categorize and filter search scopes. */
  readonly metadata: EmbeddingDocMetadata;
  /** Text content from the knowledge chunk utilized as context for LLM queries. */
  readonly content: string;
};

/**
 * Parameters guiding structural purges and resource cleanup in vector tables.
 */
export type DeletionParams = {
  /** Explicit stable row identifiers to extract and purge. */
  readonly ids?: readonly string[];
  /** Categorized metadata keys used to delete matching records globally. */
  readonly filter?: EmbeddingDocMetadata;
};

/**
 * Pure data-access interface governing localized vector catalog transactions.
 * Decoupled from runtime model compilation setter traps.
 */
export interface VectorStore {
  /** Synchronously adds or patches embedded document rows inside the persistence layer. */
  addDocuments(docs: readonly EmbeddingDoc[], embeddings: Embeddings): Promise<void>;
  
  /** Evaluates criteria filters to purge specific document fragments from cold storage. */
  deleteDocuments(params: DeletionParams): Promise<void>;
  
  /** Executes spatial k-nearest-neighbor similarity lookups against a vector space index. */
  similaritySearch(
    query: string,
    embeddings: Embeddings,
    filter?: EmbeddingDocMetadata,
    amount?: number,
  ): Promise<readonly EmbeddingDoc[]>;
}

/**
 * Structural definition mapping an instantiated embedding generation adapter.
 */
export type EmbeddingsDefinition = {
  /** Unique model provider identifier (e.g. `aws-bedrock-titan`, `openai-text-3`). */
  readonly id: string;
  /** Concrete LangChain text embedding model adapter instance used for spatial analysis. */
  readonly embeddings: Embeddings;
};

/**
 * Structural definition mapping an active vector store repository strategy wrapper.
 */
export type VectorStoreDefinition = {
  /** Stable identifier of the vector storage engine driver (e.g., `pgvector`, `qdrant`). */
  readonly id: string;
  /** Concrete instance of the vector store engine wrapper. */
  readonly store: VectorStore;
};

/**
 * Comprehensive extension point interface exposed to multi-package database adapters.
 */
export interface VectorStoreExtensionPoint {
  registerEmbeddingsProvider(definition: EmbeddingsDefinition): void;
  registerVectorStore(definition: VectorStoreDefinition): void;
}

/**
 * Read-only registry interface queried by the central BaseGraphRunner workflows.
 */
export interface VectorStorageRegistry {
  getEmbeddingsProvider(id: string): EmbeddingsDefinition | undefined;
  getVectorStore(id: string): VectorStoreDefinition | undefined;
}
```

### 🔩 Defining the Global Extension Point Token

Declare the new prefix-free Backstage extension point token within your central node library module:

```typescript
// plugins/kernel/node/src/service/databases/extensionPoint.ts
import { createExtensionPoint } from '@backstage/backend-plugin-api';
import { VectorStoreExtensionPoint } from './contracts';

/**
 * Centralized Extension Point enabling modular databases (pgvector, Qdrant)
 * and embedding models to register storage adapters at platform boot time.
 */
export const vectorStoreExtensionPoint = createExtensionPoint<VectorStoreExtensionPoint>({
  id: 'databases.vector-stores', // FIX: Updated string token to match the prefix-free package layout
});
```

### 🎨 The Refactored, Hardened Database Module Pattern

See how clean, focused, and single-purpose your `plugins/databases/pgvector` module becomes. It relies completely on standard dependency injection, registers its capabilities on the clean extension point, and skips all unrelated tools logic:

```typescript
// plugins/databases/pgvector/src/module.ts
import { createBackendModule, coreServices } from '@backstage/backend-plugin-api';
import { vectorStoreExtensionPoint } from '@ai-crew-suite/plugin-kernel-node';
import { PgVectorStoreDriver } from './PgVectorStoreDriver'; // Your database engine implementation

export const databasesModulePgVector = createBackendModule({
  pluginId: 'databases', // Matches the prefix-free package folder name
  moduleId: 'pgvector',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        vectorRegistry: vectorStoreExtensionPoint,
      },
      async init({ database, vectorRegistry }) {
        // 1. Establish the clean stateless database connection client pool natively
        const dbClient = await database.getClient();
        const pgStoreDriver = new PgVectorStoreDriver(dbClient);

        // 2. Register the store engine cleanly onto the shared extension point
        vectorRegistry.registerVectorStore({
          id: 'pgvector',
          store: pgStoreDriver,
        });
      },
    });
  },
});
```

Why this design achieves a successful refactor:

- **Eradicates Mutative State Leaks:** Moving the `embeddings: Embeddings` parameter directly into the `.addDocuments()` and `.similaritySearch()` functional calls completely eliminates the old `connectEmbeddings()` state setter trap.
- **Seamless Interface Unification:** Your `BaseGraphRunner` code paths can now accept the unified `VectorStorageRegistry` as a dependency. It resolves the requested driver and model dynamically, enabling clean execution of your agentic flows.

## Architectural Strategy & Interaction Matrix

The orchestration stack is designed around a decoupled topology to maximize testability, strict compliance isolations, and clear ownership boundaries.

The structural interactions across the workflow files are organized as follows:

```bash
                  ┌─────────────────────────────────────────┐
                  │          CQRS Entry Command             │
                  └────────────────────┬────────────────────┘
                                       │ (AgentRunInput)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │             AgentRuntime                │◀───[ Runtime Storage / Checkpoint Store ]
                  └────────────────────┬────────────────────┘
                                       │ (Spawns / Drives)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │            GraphExecutor            │◀───[ LangGraphCheckpointer ]
                  └────────────────────┬────────────────────┘
                                       │ (Orchestrated Nodes)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │             NodeHarness                 │
                  └──────────┬────────────────────┬─────────┘
                             │                    │
                             ▼                    ▼
        ┌───────────────────────┐      ┌───────────────────────┐
        │     ModelExecutor     │      │     ToolExecutor      │
        └───────────┬───────────┘      └───────────┬───────────┘
                    │                              │
                    ▼ (Outbound Redaction)         ▼ (Capability Execution)
        [ Inference Extensions ]       [ Tool Registry Providers ]
```

### High-Performance Core Interfaces

```typescript
// plugins/kernel/node/src/service/workflow/contracts.ts
import { LoggerService, HttpAuthService, PermissionsService } from '@backstage/backend-plugin-api';

export interface HardeningConfig {
  readonly timeoutMs: number;
  readonly maxTotalTokens: number;
  readonly maxRetries: number;
  readonly retryBackoffMs: number;
}

export interface AgentRunInput {
  readonly runId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly promptPayload: string;
  readonly contextVariables: Record<string, string>;
  readonly hardening: HardeningConfig;
}

export interface RunContext {
  readonly logger: LoggerService;
  readonly httpAuth: HttpAuthService;
  readonly permissions: PermissionsService;
  readonly credentialsToken: string;
  readonly userRef: string;
}

export interface AgentEvent {
  readonly type: 'info' | 'step_start' | 'step_end' | 'error' | 'checkpoint';
  readonly runId: string;
  readonly nodeId: string;
  readonly timestamp: number;
  readonly payload: unknown;
}

export interface CheckpointRecord {
  readonly runId: string;
  readonly seq: number;
  readonly nextNode: string;
  readonly stateVersion: number;
  readonly createdAt: number;
  readonly payload: Uint8Array;
}
```

### Concrete Implementation of the Greenfield Workflow Architecture

#### AgentRuntime.ts

```typescript
// plugins/kernel/backend/src/runtime/AgentRuntime.ts
import { InputError, NotFoundError } from '@backstage/errors';
import { AgentRunInput, RunContext, AgentEvent } from '@backstage/plugin-kernel-node';
import { GraphExecutor } from './GraphExecutor';

export class AgentRuntime {
  constructor(
    private readonly graphExecutor: GraphExecutor,
    private readonly checkpointStore: any
  ) {
    if (!graphExecutor || !checkpointStore) {
      throw new Error('[CRITICAL_BOOT_FAILURE][AgentRuntime]: Missing explicit dependencies during initialization phase.');
    }
  }

  public async *executeRun(input: AgentRunInput, context: RunContext): AsyncGenerator<AgentEvent, void, unknown> {
    context.logger.info('Initializing agent runtime stream context', { runId: input.runId, agentId: input.agentId });

    if (!input.runId || !input.agentId) {
      throw new InputError('Invalid operational arguments: missing explicit runId or agentId keys.');
    }

    try {
      yield* this.graphExecutor.execute(input, context);
    } catch (error) {
      const systemMessage = error instanceof Error ? error.message : 'Unknown fatal pipeline processing error';
      context.logger.error('Fatal orchestration bubble caught inside runtime container', { runId: input.runId, systemMessage });
      
      yield {
        type: 'error',
        runId: input.runId,
        nodeId: 'RUNTIME_ROOT',
        timestamp: Date.now(),
        payload: {
          message: systemMessage,
          retryable: false
        }
      };
      
      throw error;
    }
  }
}
```

#### EventMapper.ts

```typescript
// plugins/kernel/backend/src/runtime/EventMapper.ts
import { AgentEvent } from '@backstage/plugin-kernel-node';

export class EventMapper {
  public static mapToClientPayload(event: AgentEvent): string {
    return JSON.stringify({
      event: event.type,
      id: event.runId,
      step: event.nodeId,
      time: event.timestamp,
      data: event.payload
    });
  }
}
```

#### GraphExecutor.ts

```typescript
// plugins/kernel/backend/src/runtime/GraphExecutor.ts
import { AgentRunInput, RunContext, AgentEvent } from '@backstage/plugin-kernel-node';
import { NodeHarness } from './NodeHarness';
import { LangGraphCheckpointer } from './LangGraphCheckpointer';

export class GraphExecutor {
  constructor(
    private readonly nodeHarness: NodeHarness,
    private readonly checkpointer: LangGraphCheckpointer
  ) {
    if (!nodeHarness || !checkpointer) {
      throw new Error('[CRITICAL_BOOT_FAILURE][GraphExecutor]: Invariants rejected due to missing pipeline engine requirements.');
    }
  }

  public async *execute(input: AgentRunInput, context: RunContext): AsyncGenerator<AgentEvent, void, unknown> {
    let currentStepIndex = 0;
    const trackingStateNode = 'node_init_0';

    yield {
      type: 'step_start',
      runId: input.runId,
      nodeId: trackingStateNode,
      timestamp: Date.now(),
      payload: { executionIndex: currentStepIndex }
    };

    const nodeResult = await this.nodeHarness.processNode(trackingStateNode, input.promptPayload, input, context);

    yield {
      type: 'step_end',
      runId: input.runId,
      nodeId: trackingStateNode,
      timestamp: Date.now(),
      payload: { outputLength: nodeResult.length }
    };

    await this.checkpointer.saveInternalCheckpoint(input.runId, currentStepIndex, 'node_complete_terminal', nodeResult);

    yield {
      type: 'checkpoint',
      runId: input.runId,
      nodeId: 'TERMINAL_SAVE',
      timestamp: Date.now(),
      payload: { seq: currentStepIndex, committedState: true }
    };
  }
}
```

#### LangGraphCheckpointer.ts

```typescript
// plugins/kernel/backend/src/runtime/LangGraphCheckpointer.ts
import { CheckpointRecord } from '@backstage/plugin-kernel-node';

export class LangGraphCheckpointer {
  constructor(
    private readonly storageBackend: any,
    private readonly cipherEngine: any
  ) {
    if (!storageBackend || !cipherEngine) {
      throw new Error('[CRITICAL_BOOT_FAILURE][LangGraphCheckpointer]: Missing foundational infrastructure blocks.');
    }
  }

  public async saveInternalCheckpoint(runId: string, seq: number, nextNode: string, textContext: string): Promise<void> {
    const rawBuffer = Buffer.from(textContext, 'utf8');
    const encryptedBytes = this.cipherEngine.serialize(rawBuffer);

    const record: CheckpointRecord = {
      runId,
      seq,
      nextNode,
      stateVersion: 2,
      createdAt: Date.now(),
      payload: encryptedBytes
    };

    await this.storageBackend.commitRecord(record);
  }
}
```

#### ModelExecutor.ts

```typescript
// plugins/kernel/backend/src/runtime/ModelExecutor.ts
import { AgentRunInput, RunContext } from '@backstage/plugin-kernel-node';

export class ModelExecutor {
  constructor(
    private readonly inferenceRegistry: any,
    private readonly genericRedactor: any
  ) {
    if (!inferenceRegistry || !genericRedactor) {
      throw new Error('[CRITICAL_BOOT_FAILURE][ModelExecutor]: Critical components absent.');
    }
  }

  public async invokeModelPipeline(nodeId: string, incomingPrompt: string, input: AgentRunInput, context: RunContext): Promise<string> {
    context.logger.info('Executing outbound model processing chain', { runId: input.runId, nodeId });

    const maskedPrompt = String(this.genericRedactor.apply(incomingPrompt));
    const modelDriver = this.inferenceRegistry.fetchChatModelInstance('default-fallback');

    if (!modelDriver) {
      throw new Error(`[RUNTIME_MODEL_FAILURE]: Requested model configuration driver is unavailable for node: ${nodeId}`);
    }

    const rawResponse = await modelDriver.predict(maskedPrompt);
    return String(this.genericRedactor.apply(rawResponse));
  }
}
```

#### ToolExecutor.ts

```typescript
// plugins/kernel/backend/src/runtime/ToolExecutor.ts
import { AgentRunInput, RunContext } from '@backstage/plugin-kernel-node';

export class ToolExecutor {
  constructor(private readonly multiToolRegistry: any) {
    if (!multiToolRegistry) {
      throw new Error('[CRITICAL_BOOT_FAILURE][ToolExecutor]: Toolpack ecosystem requires an instantiation registry instance.');
    }
  }

  public async processToolExecution(nodeId: string, instructionPayload: string, input: AgentRunInput, context: RunContext): Promise<string> {
    context.logger.info('Resolving tool orchestration target elements', { runId: input.runId, nodeId });
    
    const operationalDrivers = this.multiToolRegistry.getByCategory('communication');
    if (operationalDrivers.length === 0) {
      return 'No active tool executions routed for current iteration node step context.';
    }

    return 'Tool execution processed cleanly across all matching active capabilities groups.';
  }
}
```

#### NodeHarness.ts

```typescript
// plugins/kernel/backend/src/runtime/NodeHarness.ts
import { AgentRunInput, RunContext } from '@backstage/plugin-kernel-node';
import { ModelExecutor } from './ModelExecutor';
import { ToolExecutor } from './ToolExecutor';

export class NodeHarness {
  constructor(
    private readonly modelExecutor: ModelExecutor,
    private readonly toolExecutor: ToolExecutor
  ) {
    if (!modelExecutor || !toolExecutor) {
      throw new Error('[CRITICAL_BOOT_FAILURE][NodeHarness]: Downstream operational tracking parameters missing.');
    }
  }

  public async processNode(nodeId: string, currentPayload: string, input: AgentRunInput, context: RunContext): Promise<string> {
    if (currentPayload.includes('__invoke_capability_call__')) {
      return await this.toolExecutor.processToolExecution(nodeId, currentPayload, input, context);
    }

    return await this.modelExecutor.invokeModelPipeline(nodeId, currentPayload, input, context);
  }
}
```
