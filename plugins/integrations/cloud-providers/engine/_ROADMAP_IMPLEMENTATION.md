# Cloud Providers Module — Aggregated Roadmap Items

## 1. Normalize `createCloudProviderTools` to `ToolDefinition` (hard gate for two plugins)

- **Problem**: `src/registerTools.ts` emits LangChain-shaped objects — `{ name: '<provider>_lookup_resource', description, execute(args) }` — registered through `tools.addTool()` as `any[]`. AI Core's `Tool` contract requires `{ id, description?, schema?, invoke(args, ctx) }`, so the cloud tools have no `id`, no `invoke`, no `effect`: agent allow-lists keyed on `cloud.*` cannot resolve them and the runtime cannot invoke them.
- **Build**: normalize to real `ToolDefinition`s: `cloud.account.lookup`, `cloud.resource.lookup`, `cloud.resource.dependencies`, all `effect: 'read'` with `invoke`. Driver ops (`lookupAccount`, `lookupResource`, `resourceDependencies`) are already read-only and correctly shaped — this is a registration-layer fix plus any read ops needed for topology capture.
- **Blocked consumers**: scaffolder-ai-shadow-detective (Milestone 0, cannot be worked around), scaffolder-ai-drift-detector (cloud reconciliation).
