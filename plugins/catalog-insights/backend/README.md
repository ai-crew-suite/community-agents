# @ai-crew-suite/plugin-agent-catalog-insights-backend

Backend module for `@ai-crew-suite/plugin-kernel-backend` that answers
contextual operational questions about any Software Catalog entity ("Who is
the on-call?", "Where are the logs?", "Why did this service fail its last
deployment?") through an intent-routed, RAG-backed, **read-only** workflow.
It never mutates the catalog, Kubernetes, or third-party systems.

## How it works

The module registers three things with AI Core at boot:

1. A **workflow runner** (`catalog-insights`) through
   `workflowRunnerExtensionPoint`.
2. An **agent definition** (`catalog-ai-insights`) through
   `agentExtensionPoint`, referencing the runner via `workflowRef` and a
   read-only tool allow-list spanning knowledge retrieval, incident
   management, observability, Kubernetes diagnostics, and VCS.
3. **Trigger bindings** (`catalog-insights-question`,
   `catalog-insights-nightly-scan`) through `triggerExtensionPoint` so manual
   and scheduled runs can start through the generic AI Core run route.

The `CatalogInsightsGraph` executes deterministic nodes:

1. **request.validate** — parses the versioned `CatalogInsightRequest` from
   the run query and resolves the target entity through the shared
   `CatalogEntityResolver` (`services/CatalogContextResolver.ts`). Unknown
   entities fail fast without a model call.
2. **intent.classify** — pure keyword/pattern routing to one of
   `ownership-oncall`, `observability-links`, `deployment-health`, or
   `general-context` (`workflow/intents.ts`). No LLM classification.
3. **context.gather** — invokes only the tool set mapped to the intent
   (`workflow/gather.ts`), gated by integration annotations
   (`backstage.io/kubernetes-id`, `pagerduty.com/*`, repository slugs).
4. **context.retrieve** — the sole RAG entry point: `knowledge.retrieve`
   scoped to the entity via `InsightRetriever` (`retrieval/InsightRetriever.ts`).
5. **context.normalize** — redacts credential-like strings, deduplicates,
   sorts by observation time, caps the bundle, and assigns stable `ctx-N`
   citation IDs (`workflow/context.ts`).
6. **insight.synthesize** — one model call with a strict JSON schema; every
   answer block must cite retained context IDs. Invalid or uncited output
   degrades to a deterministic answer (`workflow/insight.ts`).
7. **insight.finalize** — emits the `catalog-insight-report` artifact and the
   terminal run event.

Run lifecycle, tool allow-list enforcement, persistence, SSE replay, and
auditing remain owned by AI Core.

## Configuration

```yaml
ai:
  agents:
    catalogAiInsights:
      model: catalog-insights    # installation-registered model ID, required
      maxContextItems: 24        # optional, default 24
      maxRetrievalChunks: 6      # optional, default 6
      maxLogResults: 5           # optional, default 5
      maxToolInvocations: 10     # optional, default 10
      lookbackMinutes: 1440      # optional, default 1440 (deployment window)
      scan:
        enabled: false           # optional, default false (opt-in)
        cron: '0 3 * * *'        # optional
        maxScanEntities: 25      # optional, default 25
```

`model` is a registry ID supplied by an installation model module (Bedrock,
OpenAI, OpenRouter, ...); the plugin never references provider names,
endpoints, or credentials.

## Asking a question

POST a run to the generic AI Core endpoint
`/agents/catalog-ai-insights/runs` with the query set to a JSON
`CatalogInsightRequest` payload, for example:

```json
{
  "version": 1,
  "entityRef": "component:default/payment-gateway",
  "question": "Who is the on-call for this service?",
  "source": "manual"
}
```

## Nightly scan

When `scan.enabled` is true, a `coreServices.scheduler` task
(`catalog-ai-insights-nightly-scan`) lists components carrying
`backstage.io/kubernetes-id` and dispatches one authenticated
deployment-health probe per entity through the AI Core run route. Scans are
capped, mutex-guarded, and dispatched sequentially; scheduled runs are
persisted and replayable like manual runs.

## Prerequisites

- The tools in the allow-list are provided by the corresponding AI Core
  modules (retrieval-augmenter, incident-management, observability,
  kubernetes, vcs). Unconfigured tools degrade to report limitations.
- The shared `CatalogEntityResolver` contract and mapping helpers live in
  `@ai-crew-suite/plugin-kernel-node` (`src/catalog/`); this module
  provides the catalog-client adapter.

## Out of scope for v1

- Any write tool (including Slack dispatch of scan findings).
- Multi-entity or portfolio questions; one entity per run.
- Mutating catalog entities, Kubernetes, or third-party systems.
