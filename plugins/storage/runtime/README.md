# AI Core Backend Module — Runtime Store

Agent runtime persistence for the AI Crew Suite. This module owns the durable state of the `AgentRuntime`: conversation sessions, resumable checkpoints, run lifecycle records and event logs, approval decisions, artifacts, and audit logs.

It replaces the runtime persistence that previously lived in `plugin-ai-core-backend-module-storage-pgvector`, decoupling agent state from the vector embedding store so deployments can mix and match storage technologies.

## What it provides

The module assembles the five runtime persistence contracts from `@ai-crew-suite/plugin-kernel-node` and registers them with the AI backend plugin through the `runtimeStoreExtensionPoint`:

| Contract          | Purpose                                                        | Backend options      |
| ----------------- | -------------------------------------------------------------- | -------------------- |
| `SessionStore`    | Conversation session messages                                  | `database`, `redis`  |
| `CheckpointStore` | Resumable orchestration state for paused/running runs          | `database`, `redis`  |
| `RunStore`        | Run records, event logs, statuses, idempotency keys, approvals | `database`           |
| `ArtifactSink`    | Artifact references produced by runs                           | `database`           |
| `AuditLogSink`    | Audit records for write actions and approval decisions         | `database`           |

The `database` backend (`SqlAgentRuntimeStore`) uses the Backstage core database service, so it honors the site-wide `backend.database` configuration — PostgreSQL, MySQL, or SQLite — with no additional setup. Migrations are packaged with the module and applied at startup.

The `redis` backends use a dedicated Redis connection configured on this module, independent of the platform cache. This is deliberate: checkpoint and session state must not be subject to the eviction semantics of a shared cache store (for example memcached LRU or per-process memory). Run, approval, artifact, and audit records are always written to the SQL store because they form the durable system of record.

## Installation

Register the module with the AI core backend plugin:

```ts
// packages/backend/src/index.ts
backend.add(import('@ai-crew-suite/plugin-kernel-backend'));
backend.add(import('@ai-crew-suite/plugin-kernel-backend-module-runtime-store'));
```

With no configuration, every store uses the Backstage core database service.

## Configuration

All options live under `ai.runtime.stores` and are optional:

```yaml
ai:
  runtime:
    stores:
      sessions:
        backend: redis        # 'database' (default) | 'redis'
        ttlMs: 86400000       # optional sliding TTL for session entries
        maxMessages: 100      # optional cap on retained messages per session (default 100)
      checkpoints:
        backend: redis        # 'database' (default) | 'redis'
        ttlMs: 604800000      # optional sliding TTL for checkpoint entries
      redis:
        connection: rediss://user:secret@cache.example.com:6380  # required when any store uses 'redis'; rediss:// enables TLS
        keyPrefix: ai-core    # optional key prefix (default 'ai-core')
```

Validation fails fast at startup when a store selects the `redis` backend without a configured `redis.connection`, and the module pings Redis during boot so connectivity problems surface immediately rather than on the first agent run.

### Backend selection guidance

- **Sessions** are conversational memory: valuable, but tolerable to lose. Redis gives shared, fast access across multiple backend replicas.
- **Checkpoints** gate run resumption, including runs paused on human approval for days. Redis works well when it is configured for persistence; a lost checkpoint degrades its run to a restartable error state rather than corruption, since the run record itself lives in SQL.
- **Runs, approvals, artifacts, and audit logs** are compliance-relevant records and are always durable SQL.

## How it wires in

`plugin-ai-core-backend` no longer depends on any storage implementation. It registers a `runtimeStoreExtensionPoint` (from `@ai-crew-suite/plugin-kernel-node`) with per-contract setters that reject duplicate registration at boot. This module is the reference implementation; an alternate backend (for example DynamoDB) can be introduced as another module that calls the same extension point. When no module registers a store, the runtime operates without that persistence.

## Compliance and Licensing

Copyright © 2026 The AI Crew Suite Authors.
Licensed under the **Apache License, Version 2.0**.
