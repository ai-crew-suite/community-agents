# @ai-crew-suite/plugin-tool-project-management-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the **core host backend plugin for the project management integration group**. It owns the provider-neutral work tracking contract, establishes stable tool definitions, and resolves a concrete vendor driver that a sibling `-module-<provider>` package registers through its exposed extension point at boot time. It contains no vendor code and no vendor dependencies.

Transactional work tracking is deliberately separate from real-time chat infrastructure. See `@ai-crew-suite/plugin-tool-communication-backend` for Slack and Microsoft Teams capabilities.

### Core Responsibilities

* **Plugin Architecture Setup**: Establishes the core backend plugin execution framework for the `tool-project-management` namespace.
* **Extension Point Routing**: Exposes `projectManagementDriversExtensionPoint` so sibling provider packages can securely register their specific `ProjectManagementDriver` implementations.
* **Driver Resolution**: Selects and safely spins up the active driver at initialization by checking the runtime parameter `ai.integrations.projectManagement.provider`.
* **Stable Tool Registration**: Exposes and registers foundational agent tools (`project.ticket.search`, `project.ticket.get`, `project.ticket.create`, and `project.ticket.comment`) via the system's global tool extension registry.

## Available Driver Modules

| Package Name | Driver ID |
| :--- | :--- |
| **`@ai-crew-suite/plugin-tool-project-management-backend-module-jira`** | `jira` |

## Configuration

This host package manages the central configuration driver selector. Specific connection secrets and endpoint settings are owned entirely by their respective sibling driver packages.

```yaml
ai:
  integrations:
    projectManagement:
      provider: jira
```

Install the core host backend plugin alongside the specific provider module you have selected for your ecosystem runtime:

```typescript
import { toolProjectManagementPlugin } from '@ai-crew-suite/plugin-tool-project-management-backend';
import { toolProjectManagementModuleJira } from '@ai-crew-suite/plugin-tool-project-management-backend-module-jira';

// Wire up features into your Backstage backend loader
backend.add(toolProjectManagementPlugin);
backend.add(toolProjectManagementModuleJira);
```

> ⚠️ **Boot Failure Safeguard:** System initialization will fail with an explicit runtime exception if the configured `provider` string identifier maps to no registered driver in the plugin registry.

## Authoring a New Driver Module

1. Scaffold a backend module package following the pattern: `plugin-tool-project-management-backend-module-<provider>`.
2. Implement the `ProjectManagementDriver` abstract structure exposed by `@ai-crew-suite/plugin-core-node`.
3. In your new module's `createBackendModule` block, depend on `projectManagementDriversExtensionPoint` and invoke `registerDriver` during initialization.
4. Declare your driver-specific type definitions (e.g., token, endpoint fields) inside your package's custom `config.d.ts` file under `ai.integrations.projectManagement.<provider>`.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout.

### 2. Installation & Builds

```bash
yarn install --refresh
yarn workspace @ai-crew-suite/plugin-tool-project-management-backend build
```

### 3. Running Unit & Integration Tests

```bash
yarn workspace @ai-crew-suite/plugin-tool-project-management-backend test
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.  
Licensed under the **Apache License, Version 2.0**.
