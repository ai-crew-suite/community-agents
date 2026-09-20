# VCS Module — Aggregated Roadmap Items

The single biggest shared blocker across the suite. Build these once here; five-plus plugins consume them.

## 1. Write operations (each `effect: 'write'` so AI Core approval policy pauses runs)

| Tool | Driver op | Blocked consumers |
| --- | --- | --- |
| `vcs.pull_request.create` | `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` | alert-ai-tuner (Milestone 2), scaffolder-ai-drift-detector (remediate), scaffolder-ai-prd (doc publish), techdocs-ai-janitor (`deliver.mode: pull_request`), techdocs-ai-postmortem (publication) |
| `vcs.branch.create` | `createBranch(repoUrl, branch, fromRef)` | alert-ai-tuner (PR target branch) |
| `vcs.pull_request.comment` | `commentOnPullRequest(repoUrl, prId, body)` | rfc-adr-ai-reviewer (write milestone) |
| `vcs.release.publish` | `publishRelease(repoUrl, tag, body)` | release-notes-ai-generator (publish milestone) |

## 2. Read operation gaps

| Tool | Driver op | Consumers |
| --- | --- | --- |
| `vcs.repository.list_commits` (required `TimeRange` — never unbounded against metered APIs) | `listCommits({ repoUrl, path, since, until })` → `{ sha, author: ServiceActor, date, path }[]` | search-ai-archeology (blocking for authorship ranking); GitHub first, others degrade with limitation |
| `vcs.repository.get_release_tags`, `vcs.repository.compare` | tag listing + compare/diff | release-notes-ai-generator (true tag-delta windows) |
| Extended `listPullRequests(repoUrl, { path?, since?, until?, state? })` + `reviewers?: ServiceActor[]` on `PullRequestSummary` | optional, backward-compatible args | search-ai-archeology (review participation), release-notes (window filtering), kubernetes-ai-responder (incident-window PR filtering) |
| PR changed-files read (only if PR listing proves insufficient) | generic changed-files op | rfc-adr-ai-reviewer |
| Real `searchRepository` for Bitbucket/Gerrit/generic Git (currently warn + return `[]`) | implement or declare capability | tech-radar-ai-manager, search-ai-context, tech-debt-ai-scout — stub empties must surface as `unknown`/`manifest_unavailable`, never `unaffected` |
