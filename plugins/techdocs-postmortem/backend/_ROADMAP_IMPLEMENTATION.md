# TechDocs AI Postmortem — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (drafting graph delivered; PR publication gated; interim ticket bridge available).

## Blocked on shared core/module work

1. **Documentation commit (write)**
   - Blocked on `plugin-ai-core-backend-module-vcs`: `vcs.pull_request.create` with `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` (`effect: 'write'`). **Now needed by five plugins** — build once. **Blocking for PR publication only.**

2. **Resolution trigger**
   - Deferred on the AI Core events subscription gap (`coreServices.events` / `EventsService`). Keep `PostmortemRequest.source` discriminated so an `event` variant is additive; v1 uses manual runs plus an optional sweep over recently-resolved incidents.

## Available now — verify and harden (not blocked)

3. **Interim publication bridge** — `project.ticket.create` (`effect: 'write'`, exists): file a ticket carrying the full markdown draft so a human can commit it; approval-gated, same path as PR mode.
4. **Incident cross-link** — `incident.incident.annotate` (`effect: 'write'`, exists): optional post-approval annotation of the incident with the postmortem link, closing the loop.
5. **Approval gate** — implement `PostmortemGraph.resume()` (the foundation doc's `PENDING_APPROVAL` checkpoint); audit decision, actor, and draft hash.
6. **Collector idiom** — follow the per-source collectors + graceful degradation precedent from `oncall-ai-handover-assistant/src/workflow/collectors.ts` + `window.ts`; do not invent a second collection idiom.
