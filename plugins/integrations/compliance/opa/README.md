# @ai-crew-suite/plugin-tool-compliance-backend-module-opa

> OPA Extension Module for the AI Crew Suite platform.

## Overview

This package registers an Open Policy Agent (OPA) `ComplianceDriver` implementation with the core `@ai-crew-suite/plugin-tool-compliance-backend` engine through its `complianceDriversExtensionPoint`. This package exclusively owns OPA REST API interactions and data normalization, while the core module manages the universal tool execution layer.

### Core Responsibilities

- **Backend module extension**: Wires cleanly into the core compliance backend extension points.
- **OPA REST Client coordination**: Manages structural HTTP calls and authentication handlers targeting remote OPA engines.
- **Data payload normalization**: Translates tool payload models into structured OPA `input` contexts and normalizes evaluation outputs (e.g., allowances, structural violations, or costing arrays).
- **Path mapping**: Normalizes dot or slash configurations into standard OPA Data API paths (`/v1/data/<policy-path>`).

## Configuration

Ensure your `app-config.yaml` includes the structural parameters required to communicate with your OPA deployment:

```yaml
ai:
  integrations:
    compliance:
      provider: opa
      opa:
        baseUrl: https://opa.my-org.example
        defaultPolicy: compliance/iac
        permissionPolicy: compliance/permission
        architecturePolicy: compliance/architecture
        costPolicy: compliance/cost
        bearerToken: \${OPA_BEARER_TOKEN}
```

### Response Formats

The driver passes target data as the root `input` entity to OPA. It supports standard compliance validation returns, processing either a direct primitive Boolean decision or objects matching:

- `allow` / `allowed` / `passed` / `valid`
- `violations` arrays or specific costing objects.

## Installation

Add the extension module directly to your modern Backstage backend system container:

```ts
backend.add(import('@ai-crew-suite/plugin-tool-compliance-backend-module-opa'));
```

## Local Development Workflow

```bash
yarn install --refresh
yarn turbo run build --filter=@ai-crew-suite/plugin-tool-compliance-backend-module-opa
yarn turbo run lint --filter=@ai-crew-suite/plugin-tool-compliance-backend-module-opa
yarn turbo run test --filter=@ai-crew-suite/plugin-tool-compliance-backend-module-opa
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
