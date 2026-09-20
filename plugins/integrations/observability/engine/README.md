# @ai-crew-suite/plugin-tool-observability-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the **core module for the observability integration group**. It owns the provider-neutral telemetry contract and tool surface, and resolves a concrete vendor driver that a sibling extension package registers through an extension point at boot time. It contains no vendor code and no vendor dependencies.

Telemetry is deliberately separate from paging. On-call schedules, alert routing, and incident lifecycles live in `@ai-crew-suite/plugin-tool-incident-management-backend`.

### Core Responsibilities

- **Backend module registration**: Registers `aiCoreBackendModuleObservability` as an `ai-core` backend module using `createBackendModule`.
- **Extension point**: Exposes `observabilityDriversExtensionPoint` so sibling modules can register `ObservabilityDriver` implementations.
- **Driver resolution**: Selects the active driver from the runtime registry using `ai.integrations.observability.provider`.
- **Stable tool registration**: Registers `observability.metrics.query`, `observability.logs.search`, `observability.traces.search`, and `observability.dashboard.list` through the system tool extension points.

Every tool in this group is explicitly configured with `effect: 'read'`. Telemetry platforms act solely as a source of evidence for agents and are never targets for autonomous mutations or write operations.

## Available Driver Modules

| Package | Driver ID |
| --- | --- |
| `@ai-crew-suite/plugin-tool-observability-backend-module-datadog` | `datadog` |

## Configuration

This package owns only the driver selector. Connection details are owned by the sibling driver packages.

```yaml
ai:
  integrations:
    observability:
      provider: datadog
```

Install the core module alongside the driver module you selected:

```ts
backend.add(import('@ai-crew-suite/plugin-tool-observability-backend'));
backend.add(import('@ai-crew-suite/plugin-tool-observability-backend-module-datadog'));
```

Boot fails with an explicit error when the selected identifier has no registered driver.

## Authoring a New Driver Module

1. Create a workspace directory under `plugins/tools/observability/<provider>`.
2. Implement `ObservabilityDriver` from `@ai-crew-suite/plugin-tool-observability-backend` (or its shared node types).
3. Depend on `observabilityDriversExtensionPoint` in `createBackendModule` and call `registerDriver` during initialization.
4. Own `ai.integrations.observability.<provider>` in your package's `config.d.ts`.

Drivers that only fulfill partial aspects of the contract—such as a Prometheus driver lacking dashboard schemas—should return empty query results instead of throwing errors. This allows AI agents to degrade gracefully at execution time.

## Local Development Workflow

```bash
yarn install --refresh
yarn turbo run build --filter=@ai-crew-suite/plugin-tool-observability-backend
yarn turbo run lint --filter=@ai-crew-suite/plugin-tool-observability-backend
yarn turbo run test --filter=@ai-crew-suite/plugin-tool-observability-backend
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
