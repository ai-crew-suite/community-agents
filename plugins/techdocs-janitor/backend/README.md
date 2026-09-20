# TechDocs AI Janitor (Backend)

Read-only AI Core module for deterministic, cited TechDocs ownership and link audits.

- Agent: `techdocs-ai-janitor`
- Workflow: `techdocs-janitor`
- Artifact: `janitor-report`
- Tool: `vcs.repository.read_file`

The current milestone requires explicit markdown paths, compares documented owner/team values with the live catalog owner, reports relative links for verification, and labels external links as unverified without probing arbitrary hosts.

Patch generation, repair loops, API drift, catalog link resolution, ticket delivery, and documentation PRs are not active. No source mutation or VCS write is registered.

```yaml
ai:
  agents:
    techdocsJanitor:
      model: techdocs-janitor
```
