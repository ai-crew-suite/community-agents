# TechDocs AI Postmortem (Backend)

Read-only AI Core module that compiles a cited, blameless incident timeline draft.

- Agent: `techdocs-ai-postmortem`
- Workflow: `techdocs-postmortem`
- Artifact: `postmortem-draft`
- Tools: `incident.incident.get`, `incident.alert.history`

The current milestone accepts one resolved incident, derives a bounded lifecycle
window, and deterministically merges incident lifecycle events, responder-note
timestamps, and alert firings. The output is a chronological draft, never a
root-cause claim or attribution.

Chat transcripts, observability/deployment/PR evidence, ticket or documentation
publication, incident annotation, and approval/resume flows are not active. Each
missing source is recorded in the draft coverage and limitations rather than
being silently treated as empty.

```yaml
ai:
  agents:
    techdocsPostmortem:
      model: techdocs-postmortem
```
