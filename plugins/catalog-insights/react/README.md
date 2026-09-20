# Catalog AI Insights (Frontend)

Frontend plugin for the catalog AI insights agent. Ask contextual operational
questions about any Software Catalog entity — "Who is on call?", "Where are
the logs?", "Why did this service fail its last deployment?" — and follow
the RAG-backed insight run live over server-sent events.

## Surfaces

- **Entity insights card** (`EntityInsightsCard`): mounted on the catalog
  entity page. Offers canned intent questions (on-call, observability links,
  deployment health) and a free-form ask dialog, then renders the live run
  progress, the cited answer, and the retained context bundle.
- **Standalone insights page** (`/catalog-ai-insights`): secondary surface for
  deep links. Replays a run via `?run=<id>` and prefills the target entity via
  `?entityRef=<ref>`.

## Behavior contract

- `askQuestion()` POSTs a versioned `CatalogInsightRequest` JSON payload to the
  AI Core `/agents/catalog-ai-insights/runs` route and streams `AiRunEvent`s.
- The answer renders from the `catalog-insight-report` artifact event; every
  answer block shows its citations, and citations expand the referenced
  `ContextItem` — no uncited text is presented as fact.
- `status: 'insufficient_context'` and report `limitations` are rendered
  prominently.
- The `sessionId` returned with the run is preserved across questions on the
  same entity so follow-ups reuse session memory.

## New frontend system

The `/alpha` entry point exposes the API, page, and entity-card extensions as a
`FrontendFeature`. The entity card requires an entity context (it resolves the
entity reference via `@backstage/plugin-catalog-react`).
