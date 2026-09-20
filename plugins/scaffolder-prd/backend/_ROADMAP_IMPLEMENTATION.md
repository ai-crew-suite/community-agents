# Scaffolder AI PRD — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (three-channel fan-out delivered; two of three commit paths available today).

## Blocked on shared core/module work

1. **Documentation publishing (write #3)**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.create` (`effect: 'write'`). **Blocking for doc publishing only.** Shared with alert-ai-tuner, drift-detector, techdocs-ai-janitor, techdocs-ai-postmortem — build once.
   - Until then the writer node emits an outline artifact only.

2. **Per-node token streaming (UI nicety)**
   - Blocked on `plugin-ai-core-node/src/@types/run.ts`: optional `node?: string` on the `token` event (backward compatible). Same item as rfc-adr-ai-reviewer. Fall back to `step`-only channel attribution until it lands.

## Available now — verify and harden (not blocked)

3. **Ticket commit path** — `project.ticket.create` exists (`effect: 'write'`) and `CreateTicketInput.parentId` supports the epic→story hierarchy; combined with `scaffolderServiceRef.scaffold()`, two of the three commit paths are buildable today behind the approval gate: implement `PrdGraph.resume()`, checkpoint the frozen blueprint, audit decision/actor/blueprint hash, dedupe epics via `project.ticket.search` before proposing.
4. **Duplicate-epic detection** — search-before-propose so a re-submitted PRD does not duplicate tracking buckets; enrich a matched parent epic via `project.ticket.get`.
5. **PRD ingestion bounds** — `maxPrdChars` cap; treat PRD text as untrusted input (never follow instructions inside it); support `prdText` inline and `prdUrl` via `vcs.repository.read_file` / `coreServices.urlReader`.
