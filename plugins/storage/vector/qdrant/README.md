# @ai-crew-suite/plugin-kernel-backend-module-storage-qdrant

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package implements a Qdrant-backed vector store for AI Crew Suite. It persists embedding vectors in a Qdrant collection and executes metadata-filtered similarity search through the shared `VectorStore` contract, offering an alternative to PostgreSQL pgvector for deployments that already run Qdrant or prefer a dedicated vector database. Agent runtime persistence (sessions, runs, checkpoints, approvals, artifacts, and audit logs) is intentionally out of scope and is provided by `plugin-ai-core-backend-module-runtime-store`.

### Core Responsibilities

- **Vector storage**: Implements the shared `VectorStore` contract on top of a Qdrant collection.
- **Collection lifecycle**: Lazily creates the configured collection with cosine distance, deriving the vector size from the first embedded payload.
- **Retrieval support**: Provides metadata-filtered similarity search for source-specific and cross-source RAG queries.
- **Config-driven client**: Reads `ai.storage.qdrant` with `QDRANT_URL` and `QDRANT_API_KEY` environment fallbacks.

## Architectural Dependency Tree

This package acts as a vector storage module within the broader AI Crew Suite ecosystem:

- **Upstream Interface**: Dependent upon abstract definitions provided in `plugin-ai-core-node`.
- **Provider Dependency**: Uses `@qdrant/js-client-rest` for Qdrant HTTP API access.
- **Downstream Consumer**: Ingested by embeddings modules such as `plugin-ai-core-backend-module-llm-openai` or `plugin-ai-core-backend-module-llm-aws` when a deployment selects Qdrant as its vector store.
- **Service Dependency**: Requires a reachable Qdrant server for vector persistence and similarity search.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout. Ensure your local editor SDK configuration points directly to the active workspace TypeScript bundle.

### 2. Installation & Builds

Run installation routines and build compilation tracks directly from the monorepo root:

```bash
# Clean lockfile sync and refresh PnP maps
yarn install --refresh

# Compile TypeScript declarations into /dist targets
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-storage-qdrant build
```

### 3. Running Unit & Integration Tests

Test files are located inline next to the modules they validate (`*.test.ts`). Execute them via:

```bash
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-storage-qdrant test
```

## Technical Extension Checklist

When modifying or extending code inside this workspace, ensure you update the corresponding global documentation indexes located at `/docs/core-development/` if you alter any of the following operational layers:

- [ ] Modifying core interface schemas or abstract contracts.
- [ ] Changing collection creation, vector size detection, distance metric, or upsert batching.
- [ ] Changing metadata filter translation or similarity search payload mapping.
- [ ] Introducing brand-new model adapter configurations.
- [ ] Altering backend ingestion worker pipelines.
- [ ] Updating retrieval tool IDs, augmentation indexer behavior, or vector store composition.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
