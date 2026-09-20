# @ai-crew-suite/plugin-vector-store-backend-module-pgvector

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package implements the PostgreSQL pgvector storage layer for AI Crew Suite. It persists embedding vectors for retrieval augmentation and also provides the durable runtime store used for sessions, runs, checkpoints, approvals, artifacts, and audit logs.

### Core Responsibilities

- **Vector storage**: Implements the shared `VectorStore` contract on top of PostgreSQL and pgvector similarity search.
- **Runtime persistence**: Implements session, checkpoint, run, artifact, approval, and audit-log storage contracts for `AgentRuntime`.
- **Database lifecycle**: Applies packaged migrations before returning vector or runtime store instances.
- **Retrieval support**: Provides metadata-filtered similarity search for source-specific and cross-source RAG queries.

## Architectural Dependency Tree

This package acts as the persistence module within the broader AI Crew Suite ecosystem:

- **Upstream Interface**: Dependent upon abstract definitions provided in `plugin-ai-core-node`.
- **Platform Services**: Uses Backstage's database service and Knex clients supplied by the backend runtime.
- **Downstream Consumer**: Directly ingested by `plugin-ai-core-backend` for runtime persistence and by embeddings modules for vector storage.
- **Database Dependency**: Requires PostgreSQL with pgvector support for embedding similarity search.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout. Ensure your local editor SDK configuration points directly to the active workspace TypeScript bundle.

### 2. Installation & Builds

Run installation routines and build compilation tracks directly from the monorepo root:

```bash
# Clean lockfile sync and refresh PnP maps
yarn install --refresh

# Compile TypeScript declarations into /dist targets
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-storage-pgvector build
```

### 3. Running Unit & Integration Tests

Test files are located inline next to the modules they validate (`*.test.ts`). Execute them via:

```bash
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-storage-pgvector test
```

## Technical Extension Checklist

When modifying or extending code inside this workspace, ensure you update the corresponding global documentation indexes located at `/docs/core-development/` if you alter any of the following operational layers:

- [ ] Modifying core interface schemas or abstract contracts.
- [ ] Changing vector dimensions, metadata filters, insert batching, or similarity query behavior.
- [ ] Introducing brand-new model adapter configurations.
- [ ] Altering backend ingestion worker pipelines.
- [ ] Updating runtime persistence schema, migrations, approval storage, or audit-log serialization.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
