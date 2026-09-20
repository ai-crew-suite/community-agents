# Tech Debt AI Scout (Backend)

Read-only AI Core module for deterministic, cited technical-debt marker scans.

- Agent: `tech-debt-ai-scout`
- Workflow: `tech-debt-scout`
- Artifact: `tech-debt-report`
- Current tool: `vcs.repository.search`

The current scan accepts one scoped repository URL, identifies TODO/FIXME/HACK/XXX
markers and secret-shaped literals, redacts secret values before artifacts or
logs, and deterministically retains both escalated and suppressed findings.

Bitbucket and Gerrit repository URLs are explicitly reported as
`search_unsupported`; an empty report for those providers never means clean.
The current milestone makes no writes and does not attribute findings to people.
Catalog fleet discovery, manifests, scorecard/retrieval enrichment, persistent
dedupe, scheduled sweeps, and approval-gated tickets require the later plan
milestones and are not represented as active functionality.

```yaml
ai:
  agents:
    techDebtScout:
      model: tech-debt-scout
```
