# AI Crew Suite

AI Crew Suite is a Backstage plugin workspace for building retrieval-augmented, tool-using AI agents inside a developer portal. It began as a fork of the Roadie RAG AI plugins, but the architecture has been reshaped from a single assistant that answers one retrieval-backed question into a core platform for agents, crews, provider modules, runtime persistence, and structured execution streams.

The original Roadie implementation gave us the useful foundation: catalog and TechDocs ingestion, vector embeddings, a retrieval pipeline, pgvector storage, and a chat-style SSE response path. AI Crew Suite keeps that retrieval quality and makes it one capability inside a broader runtime. Retrieval is now exposed as the `knowledge.retrieve` tool, while agents can also use registered models, tools, sources, triggers, memory, approvals, artifacts, and orchestration strategies.

## What Changed From The Original RAG Plugins

Roadie's plugins were centered on one flow: ask a question, retrieve relevant Backstage context, build one prompt, stream one model response. That is still a valid use case, but it is not enough for workflows such as incident response, documentation review, cost analysis, release-note generation, PR review, drift detection, or remediation agents.

AI Crew Suite adds the missing runtime layers:

- **Agent registry**: Multiple agents can coexist in one backend, each with its own model, prompt, tools, memory mode, and orchestrator.
- **Tool registry**: Retrieval, GitHub/Jira-like integrations, operational actions, and future tool packs can be registered behind a shared `Tool` contract.
- **Model registry**: Provider modules contribute LangChain models by stable IDs, and agents reference those IDs through `modelRef`.
- **Source registry**: Retrieval sources are open-ended strings rather than a closed catalog/TechDocs-only enum.
- **Structured orchestration**: Runs emit normalized `step`, `token`, `tool_call`, `tool_result`, `approval_request`, `artifact`, `usage`, `done`, and `error` events.
- **Stateful execution**: Sessions, run steps, checkpoints, approvals, artifacts, and audit logs are persisted through configurable runtime stores — SQL via the Backstage database service, with optional Redis for sessions and checkpoints.
- **Human-in-the-loop controls**: Write-capable actions can pause for approval and resume with an auditable decision.
- **Backstage module system**: Provider packages register through Backstage backend extension points instead of legacy set-once wiring.

The result is an agent platform where RAG is still first-class, but no longer the whole system.

## Node.js Versions

This workspace supports Node.js 22 and 24, matching the Backstage framework's declared engine range (`"node": "22 || 24"`). CI runs the full pipeline against both versions.

The workspace uses Yarn PnP with a few ABI-pinned native dependencies (for example `better-sqlite3`, `isolated-vm`, and `tree-sitter`). A native build targets exactly one Node ABI at a time, so after switching local Node versions, recompile them:

```sh
yarn rebuild:native
```

Unit tests are intentionally native-module free, so `yarn lint`, `yarn typecheck`, and `yarn test` pass under either Node version without rebuilding.

## Architecture At A Glance

```mermaid
flowchart LR
  Modules[Backend modules] --> Contracts[plugin-ai-core-node]
  Contracts --> Core[plugin-ai-core-backend]
  Core --> Runtime[AgentRuntime]
  Runtime --> Orchestrators[Single-shot, LangGraph, crew]
  Runtime --> Stores[Runtime stores - SQL or Redis]
  Orchestrators --> Tools[Tool registry]
  Orchestrators --> Models[Model registry]
  Tools --> Retrieval[knowledge.retrieve]
  Retrieval --> Pipeline[Retrieval pipeline]
  Pipeline --> Vectors[pgvector]
  Pipeline --> Search[Backstage Search]
```

The important design rule is that core packages communicate through contracts, not provider-specific implementation details. The runtime does not know whether a model came from OpenRouter, whether embeddings came from OpenAI or Bedrock, or whether a future tool talks to GitHub, Jira, Kubernetes, or Scaffolder. Those details belong in modules.

## Core Package Map

| Package | Purpose |
| --- | --- |
| `@ai-crew-suite/plugin-kernel-node` | Shared contracts and Backstage extension points for sources, tools, models, agents, triggers, orchestrators, vector stores, and runtime persistence. |
| `@ai-crew-suite/agent-alert-tuner-backend` | Runtime backend plugin that assembles registries, validates wiring, creates the controller, runs orchestrators, and exposes HTTP/SSE routes. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-retrieval-augmenter` | Default catalog/TechDocs indexing, vector retrieval, Backstage Search retrieval, source routing, and retrieval post-processing. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-storage-pgvector` | PostgreSQL pgvector storage plus runtime persistence for sessions, runs, checkpoints, approvals, artifacts, and audit logs. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-storage-qdrant` | Qdrant vector store module that persists embedding vectors and executes metadata-filtered similarity search. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-llm-aws` | AWS Bedrock embeddings module that contributes an embeddings-backed retrieval/indexing tool. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-llm-openai` | OpenAI embeddings module that contributes an embeddings-backed retrieval/indexing tool. |
| `@ai-crew-suite/agent-alert-tuner-backend-module-llm-openrouter` | OpenRouter model provider module that contributes LangChain chat models to the model registry. |

See [docs/core-development/index.md](docs/core-development/index.md) for the deeper core development documentation.

## Getting Started

This repository is a Backstage monorepo using Yarn 4 Plug'n'Play, Turbo, TypeScript project references, and package-local plugin builds.

Prerequisites:

- Node.js `>=22.22.2`
- Yarn `4.17.1`, as declared by `packageManager`

Install dependencies from the project root:

```bash
yarn install --refresh
```

Run the Backstage app and backend in development mode:

```bash
yarn dev
```

Run the standard quality gates:

```bash
yarn lint
yarn typecheck:full
```

To run tests for the entire monorepo concurrently with cache optimization:

```bash
turbo run test:unit
```

To run tests for only the single alert tuner package:

```bash
turbo run test:unit --filter=@ai-crew-suite/agent-alert-tuner-backend
```

To target tests only on things that changed in your current git branch:

```bash
turbo run test:unit --filter=[HEAD~1]
```

Build the workspace:

```bash
yarn build
```

## 🔒 Security Governance: Protecting Against ReDoS (Regular Expression Denial of Service)

The `ConfigurableRedactorAdapter` allows operators to append custom matching patterns via the `ai.redaction.*` configuration tree in `app-config.yaml`. While this provides excellent runtime flexibility, introducing unverified, nested, or complex custom regular expressions (e.g., `(a+)+`) can expose the server to **ReDoS attacks** via catastrophic exponential backtracking.

Because Node.js executes JavaScript on a single-threaded event loop, a single ReDoS payload can peg a CPU core to 100%, freezing the entire container cluster node.

To completely eliminate this vulnerability and establish a bulletproof security ceiling, **operators must enforce native V8 linear backtracking limits at the process level.** This ensures that if any custom regular expression attempts excessive backtracking, the V8 engine terminates the match instantly with a safe exception rather than locking the thread thread.

### ⚙️ Deployment Configuration Options

You can enforce this safety ceiling in your infrastructure containers using either of the following environment variable configurations.

#### Approach 1: Dedicated V8 Injection Variable (Recommended)

This approach targets the V8 engine parameter registers directly, bypassing standard Node.js CLI string parsers and eliminating the risk of runtime shell argument syntax errors.

```bash
# Add this line to your Dockerfile, Kubernetes Deployment manifest, or container environment
export NODE_V8_FLAGS="--max_reg_exp_backtracks=1000"
```

#### Approach 2: Standard Node Options Envelope

If your production infrastructure standardizes on the global `NODE_OPTIONS` injection vector, you must wrap the target engine configuration parameters inside the `--v8-options` assignment mask.

```bash
# Ensure there are no spaces between the assignment flags
export NODE_OPTIONS="--v8-options=--max_reg_exp_backtracks=1000"
```

## Repository Layout

```text
packages/
  app/       Backstage frontend app shell
  backend/   Backstage backend app shell
plugins/
  backend/   AI Core backend plugin and provider modules
  frontend/  Dedicated AI agent workflow plugins
docs/
  core-development/  Architecture and maintainer docs for the core AI plugins
```

The backend plugins are the center of the current refactor. Most implementation work lives under [plugins/backend](plugins/backend), while the generated architecture docs live under [docs/core-development](docs/core-development).

## Development Workflow

Run package-specific commands from the monorepo root so Yarn PnP and workspace references resolve correctly. For example:

```bash
yarn workspace @ai-crew-suite/agent-alert-tuner-backend test
yarn workspace @ai-crew-suite/agent-alert-tuner-backend-module-llm-openrouter build
```

When adding or changing a core backend module, update the matching package README and the relevant page under [docs/core-development](docs/core-development). The core docs are organized by operational layer:

- [Core Development](docs/core-development/index.md)
- [Orchestrators & Agents](docs/core-development/orchestrators.md)
- [Runtime API & Operations](docs/core-development/runtime-api.md)
- [Ingestion Pipelines](docs/core-development/ingestion-pipelines.md)
- [LLM Providers](docs/core-development/llm-providers.md)
- [Embeddings & Vector Stores](docs/core-development/embeddings-vectorstores.md)

## 🚀 Release & Publication Management (`crew publish`)

- Proxies `yarn changeset publish` to orchestrate multi-package version increments.
- Integrates seamlessly with the npm/Yarn lifecycle hooks (`prepack` / `postpack`) declared inside individual frontend and backend plugins, ensuring distribution tarballs carry fully compiled, production-ready path definitions during registry deployment passes.

## Design Principles

The refactor is guided by a few practical decisions:

- **No legacy contract preservation**: These plugins are built for this workspace, so stale Roadie routes and singleton assumptions can be removed when they block the new architecture.
- **Registries over setters**: Sources, tools, models, agents, and triggers are additive registries keyed by stable IDs.
- **Retrieval as a tool**: The RAG pipeline is preserved and exposed as `knowledge.retrieve`, which lets every orchestrator use it without owning retrieval details.
- **Provider modules stay narrow**: Model providers register models; embeddings providers register retrieval/indexing tools; storage modules implement persistence contracts.
- **Structured streams first**: UI and runtime behavior should consume typed agent events, not provider-specific text chunks.
- **Persistence and auditability by default**: Runs, steps, approvals, artifacts, token usage, and write actions should be inspectable after execution.

## Documentation Notes

The underscore-prefixed files in [docs/core-development](docs/core-development) are historical refactor notes and planning material. They document the thinking behind the Roadie RAG migration, chunking decisions, testing strategy, and package modernization, but they are not intended to be permanent published docs.

Maintainer-facing docs that should stay current are the non-underscore files in [docs/core-development](docs/core-development) and the package READMEs under [plugins/backend](plugins/backend).

## License

Copyright 2026 The AI Crew Suite Authors Licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
