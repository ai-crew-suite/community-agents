# Scaffolder AI Intent — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (interactive intent→template→parameter flow; no core blockers — plan explicitly states no new coercion/approval/persistence machinery is needed in core).

## Plugin-local items (no core blocker)

1. **Multi-turn correction loop polish** — session memory carries issue history across correction turns; verify `IntentGraph.resume()` checkpoints the frozen parameter set before the confirmation gate and audits confirmation, actor, template ref, and parameter hash.
2. **Template ranking guidance** — optional `knowledge.retrieve` evidence for template selection; must never select the template or set a parameter value (assert in tests with retrieval enabled/disabled byte-identical parameters).
3. **Advisory policy checks** — optional `compliance.policy.evaluate` / `compliance.architecture.validate` on parameters, kept advisory (`checkPolicy` default false); hard governance stays with scaffolder-ai-guardrail-agent so a request is not blocked twice.
4. **Dry-run pre-flight** — optional `scaffolderServiceRef.dryRun` validation before the gate; degrade silently when failure is unrelated to parameters.
5. **Name-collision self-healing** — catalog `getEntityByRef`/`getEntities` collision check driving the rename loop (the `payment-gateway` case); reuse the `CatalogClientLike` adapter shape from catalog-ai-insights.

## Coordination notes

- This plugin is the verified consumer of the real `scaffolderServiceRef` (`@backstage/plugin-scaffolder-node` v0.13.5): `getTemplateParameterSchema`, `scaffold`, `dryRun`, `getTask`, `listTasks`, `autocomplete`. Its adapter patterns are the reference for any future Scaffolder work in other plugins.
