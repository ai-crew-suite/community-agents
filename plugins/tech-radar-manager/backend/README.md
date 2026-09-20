# Tech Radar AI Manager (Backend)

AI Core module for a scoped, deterministic technology-radar analysis.

- Agent: `tech-radar-ai-manager`
- Workflow: `tech-radar-analysis`
- Artifact: `radar-analysis`
- Tool: `vcs.repository.read_file`

The current milestone reads the configured authoritative JSON radar source and a
single repository's `package.json`, then measures declared direct dependencies
and derives only deterministic `assess → trial` proposals. It does not infer
rings or mutate the radar.

Fleet enumeration, multi-repository coverage, durable observation history,
knowledge enrichment, approval-gated proposal submission, and deprecation
ticket filing remain unavailable in the deployed workflow. These gaps are
recorded in every analysis artifact instead of being represented as active
functionality. The quality-scorecard Tech Radar driver is itself non-durable,
so the UI must never imply a future submission is a persisted radar change.

```yaml
ai:
  agents:
    techRadarManager:
      model: tech-radar-manager
      radar:
        sourceUrl: https://example.invalid/radar-data.json
```
