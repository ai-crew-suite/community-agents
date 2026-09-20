# Search AI Context (Cross-Service Impact) — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (impact graph delivered; manual trigger only).

## Blocked on shared core/module work

1. **Event-triggered analysis**
   - Hard gap in `plugin-ai-core-backend`: no `coreServices.events`, no `eventsServiceRef`, no `EventsService` anywhere; `TriggerBinding.source` is an unbacked free-form string. Deferred — register only a `manual` trigger; keep `ImpactRequest.source` discriminated so an `event` variant is purely additive when an events contract lands. **Blocking for automatic runs only.**

2. **VCS search coverage for stub drivers**
   - `vcs.repository.search` is real for GitHub/GitLab/Azure but Bitbucket, Gerrit, and generic Git warn and return `[]`. Extend coverage in `plugin-ai-core-backend-module-vcs`; until then, empty results from stub drivers must map to `unknown` (never `unaffected`) via the config-declared capability list — the single most dangerous failure mode in this plugin.

## Plugin-local items (no core blocker)

3. **Resumable validation** — checkpoint after each repository so a failure at repo 12/50 resumes at validation without re-crawling the catalog.
4. **Bounded crawl consumption** — request `['dependsOn','dependencyOf','providesApi','apiConsumedBy']` from `CatalogEntityResolver.getRelations` with `maxDepth`/`limit`; treat `truncated: true` as a first-class `partial` outcome.
5. **Call-site context** — pull bounded `vcs.repository.read_file` context around matches so reports show the call site, not just a line number.
