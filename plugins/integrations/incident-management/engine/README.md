# @ai-crew-suite/plugin-tool-incident-management-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the **core module for the incident management integration group**. It owns the provider-neutral on-call, paging, and incident lifecycle contract and tool surface, and resolves a concrete vendor driver that a sibling extension package registers through an extension point at boot time. It contains no vendor code and no vendor dependencies.

Paging and incident response is deliberately separate from telemetry. See `@ai-crew-suite/plugin-tool-observability-backend` for Datadog, New Relic, and Splunk.

### Core Responsibilities

- **Backend module registration**: Registers `aiCoreBackendModuleIncidentManagement` as an `ai-core` backend module using `createBackendModule`.
- **Extension point**: Exposes `incidentManagementDriversExtensionPoint` so sibling modules can register `IncidentManagementDriver` implementations.
- **Driver resolution**: Selects the active driver from the runtime registry using `ai.integrations.incidentManagement.provider`.
- **Stable tool registration**: Registers `incident.incident.list`, `incident.incident.get`, `incident.oncall.get`, `incident.alert.history`, and `incident.incident.annotate` through the system tool extension points.

## Available Driver Modules

| Package | Driver ID |
| --- | --- |
| `@ai-crew-suite/plugin-tool-incident-management-backend-module-pagerduty` | `pagerduty` |

## Configuration

This package owns only the driver selector. Connection details are owned by the sibling driver packages.

```yaml
ai:
  integrations:
    incidentManagement:
      provider: pagerduty
```

Install the core module alongside the driver module you selected:

```ts
backend.add(import('@ai-crew-suite/plugin-tool-incident-management-backend'));
backend.add(import('@ai-crew-suite/plugin-tool-incident-management-backend-module-pagerduty'));
```

Boot fails with an explicit error when the selected identifier has no registered driver.

## Authoring a New Driver Module

1. Create a workspace directory under `plugins/tools/incident-management/<provider>`.
2. Implement `IncidentManagementDriver` from `@ai-crew-suite/plugin-tool-incident-management-backend` (or its shared node types).
3. Depend on `incidentManagementDriversExtensionPoint` in `createBackendModule` and call `registerDriver` during initialization.
4. Own `ai.integrations.incidentManagement.<provider>` in your package's `config.d.ts`.

## Local Development Workflow

```bash
yarn install --refresh
yarn turbo run build --filter=@ai-crew-suite/plugin-tool-incident-management-backend
yarn turbo run lint --filter=@ai-crew-suite/plugin-tool-incident-management-backend
yarn turbo run test --filter=@ai-crew-suite/plugin-tool-incident-management-backend
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
