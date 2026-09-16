# @ai-crew-suite/plugin-kernel-backend-module-llm-aws

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package implements the AWS Bedrock embeddings module for AI Crew Suite. It creates a pgvector-backed retrieval and indexing dependency, wires Bedrock embedding clients into the default augmentation indexer, and registers the resulting tool with the core backend through Backstage's module system.

### Core Responsibilities

- **Backend module registration**: Registers `aiCoreBackendModuleLlmAws` as an `ai-core` backend module using `createBackendModule`.
- **Bedrock embeddings**: Creates embedding clients for Bedrock models, including Cohere-specific response handling where needed.
- **Retrieval tool wiring**: Registers `aws.bedrock.retrieval` with an augmentation indexer and default retrieval pipeline.
- **Storage composition**: Creates the pgvector store used for embedding writes and semantic retrieval.

## Architectural Dependency Tree

This package acts as an embeddings provider module within the broader AI Crew Suite ecosystem:

- **Upstream Interface**: Dependent upon abstract definitions provided in `plugin-ai-core-node`.
- **Core Consumer**: Registered into `plugin-ai-core-backend` through `toolExtensionPoint`.
- **Storage Dependency**: Uses `plugin-ai-core-backend-module-storage-pgvector` for vector persistence.
- **Retrieval Dependency**: Uses `plugin-ai-core-backend-module-retrieval-augmenter` for indexing and retrieval pipeline behavior.
- **Provider Dependency**: Uses AWS Bedrock SDK and LangChain AWS embeddings implementations.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout. Ensure your local editor SDK configuration points directly to the active workspace TypeScript bundle.

### 2. Installation & Builds

Run installation routines and build compilation tracks directly from the monorepo root:

```bash
# Clean lockfile sync and refresh PnP maps
yarn install --refresh

# Compile TypeScript declarations into /dist targets
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-llm-aws build
```

### 3. Running Unit & Integration Tests

Test files are located inline next to the modules they validate (`*.test.ts`). Execute them via:

```bash
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-llm-aws test
```

## Technical Extension Checklist

When modifying or extending code inside this workspace, ensure you update the corresponding global documentation indexes located at `/docs/core-development/` if you alter any of the following operational layers:

- [ ] Modifying core interface schemas or abstract contracts.
- [ ] Changing Bedrock config validation, region resolution, retries, concurrency, or embedding dimensions.
- [ ] Introducing brand-new model adapter configurations.
- [ ] Altering backend ingestion worker pipelines.
- [ ] Updating retrieval tool IDs, augmentation indexer behavior, or pgvector composition.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
