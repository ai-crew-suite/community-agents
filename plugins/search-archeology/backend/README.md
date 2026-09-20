# Search AI Archeology (Backend)

A read-only AI Core module that produces a cited expertise matrix from bounded
project-ticket triage evidence for one manually submitted legacy-system question.

- Agent ID: `search-ai-archeology`
- Workflow ID: `knowledge-archeology`
- Artifact kind: `expertise-matrix`
- Tools: `project.ticket.search`, `project.ticket.get` only

## Evidence and identity policy

The workflow searches a bounded ticket set, fetches ticket detail, and records
assignee-history and comment-author signals. It ranks only deterministic,
cited triage counts; the score is familiarity evidence, never a measure of
skill, merit, productivity, or seniority. Raw provider actors that cannot be
mapped are retained as `unresolved`, or `offboarded` when configured, rather
than guessed catalog users or teams.

## Current limitations

This is the viable ticket-triage milestone. The shared contracts do not yet
provide commit/blame history, PR reviewers, time-bounded ticket queries, or
email-to-catalog-user resolution. The artifact names each limitation and never
fabricates evidence from those unavailable sources. There are no write tools,
no approval flow, and no contact action.

## Configuration

```yaml
ai:
  agents:
    searchArcheology:
      model: search-archeology
      maxTickets: 40
      maxLookbackYears: 5
      identity:
        treatUnresolvedAsOffboarded: false
      ranking:
        weightTriaged: 1
        maxExperts: 10
```

See `config.d.ts` for the complete configuration schema.
