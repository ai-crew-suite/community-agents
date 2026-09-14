# @ai-crew-suite/plugin-kernel-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the core AI backend plugin for AI Crew Suite. It owns the runtime service graph that collects extension-point registrations, validates source/tool/model/agent wiring, creates the agent controller, mounts HTTP/SSE routes, and coordinates orchestration through `AgentRuntime`.

### Core Responsibilities

- **Runtime assembly**: Builds the resolved source registry, model registry, tool registry, built-in agents, configured agents, orchestrators, and runtime hardening options.
- **Agent execution**: Runs single-shot, LangGraph-style, and crew orchestrators through a shared event stream and persistence contract.
- **API surface**: Exposes query, embeddings, run, approval, and replay routes through the Backstage backend router.
- **Persistence integration**: Wires the pgvector runtime store for sessions, checkpoints, runs, approvals, artifacts, and audit logs.

## Architectural Dependency Tree

This package acts as the central runtime plugin within the broader AI Crew Suite ecosystem:

- **Upstream Interface**: Dependent upon abstract definitions provided in `plugin-ai-core-node`.
- **Provider Inputs**: Consumes model definitions, tools, sources, agents, and triggers registered by backend modules.
- **Storage Dependency**: Uses `plugin-ai-core-backend-module-storage-pgvector` or `plugin-ai-core-backend-module-storage-qdrant` to create the default runtime vector embeddings persistence store.
- **Downstream Consumer**: Directly ingested by a Backstage backend through the exported `ragAiPlugin` backend plugin.

## Local Development Workflow

### 1. Installation & Builds

Run installation routines and build compilation tracks directly from the monorepo root:

```bash
yarn install --refresh
yarn turbo run build --filter=@ai-crew-suite/plugin-kernel-backend
```

### 2. Running Unit & Integration Tests

```bash
yarn turbo run lint --filter=@ai-crew-suite/plugin-kernel-backend
yarn turbo run test:unit --filter=@ai-crew-suite/plugin-kernel-backend
```

## Technical Extension Checklist

When modifying or extending code inside this workspace, ensure you update the corresponding global documentation indexes located at `/docs/core-development/` if you alter any of the following operational layers:

- [ ] Modifying core interface schemas or abstract contracts.
- [ ] Changing orchestrator event flow, retry behavior, approval handling, or runtime persistence.
- [ ] Introducing brand-new model adapter configurations.
- [ ] Altering backend ingestion worker pipelines.
- [ ] Adding or changing default agents, built-in tools, API routes, or hardening options.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
