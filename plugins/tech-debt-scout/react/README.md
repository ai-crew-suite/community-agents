# Tech Debt AI Scout (Frontend)

Standalone Backstage page for starting and replaying a cited, deterministic
technical-debt scan.

- Route: `/tech-debt-ai-scout`
- Agent: `tech-debt-ai-scout`
- Artifact: `tech-debt-report`

The page requires a repository URL and renders repository outcomes, escalated
findings, retained suppressed findings, limitations, and evidence citations.
Secret-shaped values are expected to be redacted by the backend and are never
rendered as raw source values.

The deployed backend currently supports a read-only repository marker scan.
Fleet scheduling, dependency manifests, scorecard/retrieval enrichment,
persistent dedupe, and approval-gated ticket filing are shown only as explicit
backend limitations; this UI does not offer controls for unavailable writes.
