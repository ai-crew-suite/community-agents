# Project Management Module — Aggregated Roadmap Items

No blocking items reported. `project.ticket.create`/`comment` (`effect: 'write'`) and `project.ticket.get`/`search` (read) — including `CreateTicketInput.parentId` for epic→story hierarchies and `TicketDetail.assigneeHistory` — unblock the scaffolder-ai-prd commit paths, tech-debt-ai-scout reporter, tech-radar deprecation tickets, and the techdocs-ai-janitor/postmortem ticket bridges.

## Watch items (not blockers)

- `TicketSearchQuery` does not extend `TimeRange` (see `plugin-ai-core-node` items) — the type change lands in core-node, but the Jira driver should honor the new window fields once present so search-ai-archeology can stop client-side filtering.
