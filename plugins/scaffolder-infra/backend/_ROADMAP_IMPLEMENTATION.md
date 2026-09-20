# Scaffolder AI Infra — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (deterministic approved-blueprint preview delivered; generation loop and writes deferred).

## Blocked on shared core/module work

1. **Real generation path — `ai:infra:generate` Scaffolder action**
   - File writes remain exclusive to a real Scaffolder action (not yet built). The preview runner never writes; the frontend intentionally has no content tabs or history API because no generated file contents or report-list endpoint are persisted.
   - Depends on the shared Scaffolder helper surface (`plugin-ai-core-node/src/scaffolder/`, unbuilt) and `scaffolderServiceRef` consumption patterns proven by scaffolder-ai-intent.

2. **Policy validation over generated files**
   - Deferred integration: run `compliance.policy.evaluate` / `compliance.architecture.validate` over generated file sets (not just parameters). Confirm with the compliance module and keep guardrail-agent as the hard-governance owner to avoid double blocking.

3. **Catalog ownership/duplicate adapters**
   - Deferred: catalog-driven ownership resolution and duplicate-service detection via the `CatalogEntityResolver` / `CatalogClientLike` adapter pattern from catalog-ai-insights.

4. **Repository-blueprint sourcing**
   - Deferred: reading approved blueprints from repositories (bounded `vcs.repository.read_file`/`search` paths) instead of only packaged sources.

## Plugin-local items (no core blocker)

5. **Model generation/correction loop (explicitly not fabricated)** — when desired, add a bounded model loop that proposes hole-values within the approved blueprint; deterministic rendering stays the merge gate, and model output must validate against the blueprint schema before render.
