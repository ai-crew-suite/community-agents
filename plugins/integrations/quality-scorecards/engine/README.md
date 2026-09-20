# @ai-crew-suite/plugin-tool-quality-scorecards-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the **core host backend plugin for the quality scorecards integration group**. It registers stable, provider-neutral service quality, engineering standards, scorecard maturity, and deployment readiness tools into the global platform ecosystem.

By wrapping execution behind a uniform `QualityScorecardDriver` interface, it hides vendor-specific API configurations and response payloads from upstream agents. This allows workspace entities to swap or combine auditing tools without breaking agent runtime flows.

### Core Responsibilities

* **Plugin Architecture Setup**: Establishes the core backend plugin execution framework for the `tool-quality-scorecards` namespace.
* **Extension Point Routing**: Exposes `qualityScorecardsDriversExtensionPoint` so sibling provider packages can securely register their specific `QualityScorecardDriver` implementations.
* **Driver Resolution**: Selects and initializes the active analytics driver at boot time by evaluating the `ai.integrations.qualityScorecards.provider` configuration string.
* **Stable Tool Registration**: Declares and exposes foundational agentic capability tools (`quality.scorecard.get`, `quality.checks.list`, `quality.tech_radar.lookup`, and `quality.service_profile.get`) via the platform's global tool extension registry.

## Available Driver Modules

| Package Name | Driver ID | Supported Ecosystem |
| :--- | :--- | :--- |
| **`@ai-crew-suite/plugin-tool-quality-scorecards-backend-module-soundcheck`** | `soundcheck` | Spotify Backstage Soundcheck Plugin |
| **`@ai-crew-suite/plugin-tool-quality-scorecards-backend-module-scorecards`** | `scorecards` | Cortex / Custom scorecard platforms |
| **`@ai-crew-suite/plugin-tool-quality-scorecards-backend-module-techradar`** | `techradar` | Platform Technology Radar assessments |

## Configuration

This host package manages the central configuration driver selector. Specific connection details, security credentials, and endpoint targets are owned entirely by their respective sibling driver packages.

```yaml
ai:
  integrations:
    qualityScorecards:
      provider: soundcheck
```

Install the core host backend plugin alongside the specific provider module you have selected for your ecosystem runtime:

```typescript
import { toolQualityScorecardsPlugin } from '@ai-crew-suite/plugin-tool-quality-scorecards-backend';
import { toolQualityScorecardsModuleSoundcheck } from '@ai-crew-suite/plugin-tool-quality-scorecards-backend-module-soundcheck';

// Wire up features into your Backstage backend loader
backend.add(toolQualityScorecardsPlugin);
backend.add(toolQualityScorecardsModuleSoundcheck);
```

> ⚠️ **Boot Failure Safeguard:** System initialization will fail with an explicit runtime exception if the configured `provider` string identifier maps to no registered driver in the plugin registry.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout.

### 2. Installation & Builds

```bash
yarn install --refresh
yarn workspace @ai-crew-suite/plugin-tool-quality-scorecards-backend build
```

### 3. Running Unit & Integration Tests

```bash
yarn workspace @ai-crew-suite/plugin-tool-quality-scorecards-backend test
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.  
Licensed under the **Apache License, Version 2.0**.
