# Tech Radar AI Manager (Frontend)

Standalone Backstage page for submitting and replaying cited, deterministic
technology-radar analyses.

- Route: `/tech-radar-ai-manager`
- Agent: `tech-radar-ai-manager`
- Artifact: `radar-analysis`

The page accepts a repository URL, shows direct `package.json` dependency
adoption metrics, deterministic `assess → trial` recommendations, coverage,
limitations, and citations from the authoritative configured radar source.

The deployed backend is read-only. Fleet sweeps, durable longitudinal velocity,
knowledge enrichment, deprecation ticket filing, and radar proposal submission
are unavailable and shown only as limitations. The page deliberately has no
submit/approve controls, so an analysis cannot be mistaken for a persisted radar
change.
