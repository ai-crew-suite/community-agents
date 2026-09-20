# Search AI Archeology — Roadmap Implementation Items

Status source: `_IMPLEMENTATION.md` (ownership-tracing graph; v1 viable on ticket evidence before VCS work lands).

## Blocked on shared core/module work

1. **Commit/blame history (blocking for authorship ranking)**
   - `plugin-ai-core-backend-module-vcs`: add a provider-neutral history op `vcs.repository.list_commits({ repoUrl, path, since, until })` → `{ sha, author: ServiceActor, date, path }[]` (`effect: 'read'`) with a **required** `TimeRange` so an agent cannot issue an unbounded history query against a metered API. Implement for GitHub first; other providers degrade with a limitation.

2. **Review participation (partially blocking)**
   - Extend `VcsDriver.listPullRequests(repoUrl, { path?, since?, until?, state? })` (optional args, backward compatible) and add `reviewers?: ServiceActor[]` to `PullRequestSummary`. Without it, review evidence is unavailable and only ticket evidence remains.

3. **Era-bounded ticket queries**
   - `TicketSearchQuery` (in `plugin-ai-core-node` types) does not extend `TimeRange` unlike `AlertHistoryQuery`/`IncidentSearchQuery`. Add it for consistency; until then, filter client-side by ticket timestamps and record the over-fetch as a limitation.

4. **Org-graph identity mapping**
   - `CatalogEntityResolver` landed but has no email/profile lookup. Add `findUserByEmail(email)` (or generic `findByField`) plus `memberOf` traversal via `getRelations` — the `active-lead@company.com` → `team-core-infra` path. Unresolvable identity stays a first-class `offboarded` outcome.

## Plugin-local items (no core blocker)

5. **Rate-limit resilience** — checkpoint after each evidence-collection page so a `429` resumes at the exact node boundary without re-running completed retrieval (foundation doc §2).
6. **Ticket-evidence-first ranking** — `TicketDetail.comments[].author` and `assigneeHistory` (whose doc comment cites archeology-style ownership tracing) are the richest signal available today; keep them the primary evidence until items 1–2 land.
