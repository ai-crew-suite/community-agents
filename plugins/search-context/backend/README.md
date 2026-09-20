# Search AI Context (Backend)

Read-only AI Core module that answers a bounded version of “what breaks if I change this?”

- Agent: `search-ai-context`
- Workflow: `cross-service-impact`
- Artifact: `impact-assessment`
- Tools: `vcs.repository.search`, `vcs.repository.read_file`, `knowledge.retrieve`

The workflow crawls configured catalog dependency relations from one required source
entity and verifies each candidate with repository code search. A match is reported
as a **textual reference**, not proven runtime breakage. Only a zero-match search on
a configured capable provider is `unaffected`; unavailable repositories, unsupported
providers, and search failures are always `unknown`.

The initial slice does not implement retrieval enrichment, file-context reads, or
per-repository resume checkpoints. It makes no writes, sends no notifications, and
never treats catalog edges or documentation as proof of impact.

```yaml
ai:
  agents:
    searchContext:
      model: search-context
      maxDepth: 3
      maxConsumers: 50
      capableProviders: [github, gitlab, azuredevops]
```
