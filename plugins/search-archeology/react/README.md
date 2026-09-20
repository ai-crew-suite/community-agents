# Search AI Archeology (Frontend)

Standalone Backstage page for submitting and replaying a cited,
read-only legacy-system familiarity research run.

- Route: `/search-ai-archeology`
- Agent: `search-ai-archeology`
- Artifact: `expertise-matrix`

The UI submits one question with either a repository URL or catalog entity scope.
It renders ticket-triage familiarity evidence, citations, explicit unresolved or
offboarded identities, and backend limitations. Scores are not measures of skill,
merit, productivity, or seniority.

The current backend supports ticket search/detail evidence only. Commit/blame
history, PR reviewers, catalog identity resolution, and time-bounded ticket
search are shown as explicit limitations instead of implied capabilities.
