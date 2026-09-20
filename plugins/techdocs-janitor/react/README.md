# TechDocs AI Janitor (Frontend)

Standalone Backstage page for starting and replaying cited, read-only TechDocs
audits.

- Route: `/techdocs-ai-janitor`
- Agent: `techdocs-ai-janitor`
- Artifact: `janitor-report`

The form requires a catalog entity reference, repository URL, and explicit
markdown paths. The report renders owner/link discrepancies with source ranges,
limitations, and catalog/markdown citations.

The deployed backend does not create documentation patches, repair content,
file tickets, or open pull requests. The UI intentionally contains no patch or
delivery approval control and labels external links as unverified where the
backend cannot probe them.
