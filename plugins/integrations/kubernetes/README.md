# @ai-crew-suite/plugin-tool-kubernetes-backend

> Kubernetes Diagnostics Module for the AI Crew Suite platform.

## Overview

This package implements the **core orchestration engine and driver runtime for Kubernetes operational diagnostics**. It manages the universal tool execution layer for normalized workloads, pods, logs, events, and lifecycle timelines.

To maintain administrative guarantees, this module purposefully avoids constructing direct Kubernetes API clients from raw environment variables. Instead, it hooks directly into Backstage's unified Kubernetes backend ecosystem, safely inheriting its established cluster supplier, localized service locator, and multi-tenant authentication patterns.

### Stable Tools

Every diagnostic capability exposed by this suite operates strictly as a read-only query. Drivers are required to establish bounded window sizes and strip or redact secrets, tokens, or ambient configuration values before shipping payload outputs:

* `kubernetes.workload.resolve`
* `kubernetes.workload.get_snapshot`
* `kubernetes.pod.get_snapshot`
* `kubernetes.pod.get_logs`
* `kubernetes.workload.list_events`
* `kubernetes.workload.get_timeline`

## Configuration

Activate the integration framework inside your global `app-config.yaml` layout by wiring it to your platform driver:

```yaml
ai:
  integrations:
    kubernetes:
      provider: backstage
```

The system requires an active driver matching the configured provider identifier. Startup sequences will panic and error out immediately if a driver definition is omitted during container boot.

## Installation

Add the extension module directly to your modern Backstage backend system container:

```ts
backend.add(import('@ai-crew-suite/plugin-tool-kubernetes-backend'));
```

## Local Development Workflow

```bash
yarn install --refresh
yarn turbo run build --filter=@ai-crew-suite/plugin-tool-kubernetes-backend
yarn turbo run lint --filter=@ai-crew-suite/plugin-tool-kubernetes-backend
yarn turbo run test --filter=@ai-crew-suite/plugin-tool-kubernetes-backend
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
