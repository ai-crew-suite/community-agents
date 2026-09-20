# @ai-crew-suite/plugin-tools-vcs-backend

> Core Developer Documentation for the AI Crew Suite platform.

## Overview

This package is the **core host backend plugin for the version control system (VCS) integration group**. It defines the core repository-neutral data models, establishes stable code analysis tool definitions, and resolves concrete vendor drivers that sibling `-module-<provider>` packages register through its exposed extension point at boot time. It contains no vendor code and no vendor dependencies.

By decoupling agent operations from vendor-specific source control platforms, this framework enables AI Crew Suite agents to audit pull requests, inspect code changes, and fetch file structures uniformly across hybrid Git topologies.

### Core Responsibilities

* **Plugin Architecture Setup**: Establishes the core backend plugin execution framework for the `tools-vcs` namespace.
* **Extension Point Routing**: Exposes `vcsDriversExtensionPoint` so sibling provider modules can securely register their specific `VcsDriver` implementations.
* **Driver Resolution**: Evaluates the active environment driver at boot time by matching the configured string value of `ai.integrations.vcs.provider`.
* **Stable Tool Registration**: Declares and exposes foundational agentic source control tools (such as file reading, pull request auditing, branch comparison, and commit analysis queries) via the platform's global tool extension registry.

## Available Driver Modules

| Package Name | Driver ID | Core Version Control Target |
| :--- | :--- | :--- |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-github`** | `github` | GitHub Cloud / GitHub Enterprise Server |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-gitlab`** | `gitlab` | GitLab SaaS / Self-Managed Instances |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-azure`** | `azure` | Azure DevOps Repositories |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-bitbucket`** | `bitbucket` | Bitbucket Cloud / Bitbucket Server |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-aws-codecommit`** | `aws-codecommit` | AWS CodeCommit Hosted Repositories |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-gerrit`** | `gerrit` | Gerrit Code Review Topologies |
| **`@ai-crew-suite/plugin-tools-vcs-backend-module-git`** | `git` | Local filesystem / Raw unmanaged Git operations |

## Configuration

This host package manages the central configuration driver selector. Specific connection secrets, personal access tokens, SSH configurations, and endpoint targets are owned entirely by their respective sibling driver packages.

```yaml
ai:
  integrations:
    vcs:
      provider: github
```

Install the core host backend plugin alongside the specific provider module you have selected for your ecosystem runtime:

```typescript
import { toolVcsPlugin } from '@ai-crew-suite/plugin-tools-vcs-backend';
import { toolVcsModuleGithub } from '@ai-crew-suite/plugin-tools-vcs-backend-module-github';

// Wire up features into your Backstage backend loader
backend.add(toolVcsPlugin);
backend.add(toolVcsModuleGithub);
```

> ⚠️ **Boot Failure Safeguard:** System initialization will fail with an explicit runtime exception if the configured `provider` string identifier maps to no registered driver in the plugin registry.

## Local Development Workflow

### 1. Prerequisites & Context

This workspace relies on the monorepo's shared **Yarn Plug'n'Play (PnP)** caching layout.

### 2. Installation & Builds

```bash
yarn install --refresh
yarn workspace @ai-crew-suite/plugin-tools-vcs-backend build
```

### 3. Running Unit & Integration Tests

```bash
yarn workspace @ai-crew-suite/plugin-tools-vcs-backend test
```

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.  
Licensed under the **Apache License, Version 2.0**.
