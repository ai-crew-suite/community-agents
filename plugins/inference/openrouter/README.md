# @ai-crew-suite/plugin-kernel-backend-module-llm-openrouter

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package implements the OpenRouter model provider module for AI Crew Suite. It reads `ai.models.openrouter` configuration, creates LangChain `ChatOpenRouter` model instances, and registers them with the core backend model registry for use by agents and crew roles.

### Core Responsibilities

- **Backend module registration**: Registers `aiCoreBackendModuleLlmOpenRouter` as an `ai-core` backend module using `createBackendModule`.
- **Model construction**: Creates one or more validated `ChatOpenRouter` instances from app-config.
- **Model registry wiring**: Registers stable `ModelDefinition` IDs through `modelExtensionPoint`.
- **Provider isolation**: Supplies generation models only; retrieval and embeddings remain owned by separate embeddings modules.

## Architectural Dependency Tree

This package acts as a model provider module within the broader AI Crew Suite ecosystem:

- **Upstream Interface**: Dependent upon abstract definitions provided in `plugin-ai-core-node`.
- **Core Consumer**: Registered into `plugin-ai-core-backend` through `modelExtensionPoint`.
- **Provider Dependency**: Uses `@langchain/openrouter` to create `ChatOpenRouter` model instances.
- **Companion Modules**: Requires an embeddings module such as `plugin-ai-core-backend-module-llm-openai` or `plugin-ai-core-backend-module-llm-aws` when agents need retrieval-augmented context.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout. Ensure your local editor SDK configuration points directly to the active workspace TypeScript bundle.

### 2. Installation & Builds

Run installation routines and build compilation tracks directly from the monorepo root:

```bash
# Clean lockfile sync and refresh PnP maps
yarn install --refresh

# Compile TypeScript declarations into /dist targets
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-llm-openrouter build
```

### 3. Running Unit & Integration Tests

Test files are located inline next to the modules they validate (`*.test.ts`). Execute them via:

```bash
yarn workspace @ai-crew-suite/plugin-kernel-backend-module-llm-openrouter test
```

## Technical Extension Checklist

When modifying or extending code inside this workspace, ensure you update the corresponding global documentation indexes located at `/docs/core-development/` if you alter any of the following operational layers:

- [ ] Modifying core interface schemas or abstract contracts.
- [ ] Changing OpenRouter config validation, model ID resolution, or model construction options.
- [ ] Introducing brand-new model adapter configurations.
- [ ] Altering backend ingestion worker pipelines.
- [ ] Updating model registration behavior used by agent `modelRef` values.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
