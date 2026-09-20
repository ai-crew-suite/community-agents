# TechDocs AI Postmortem (Frontend)

Standalone Backstage page for starting and replaying cited, read-only incident
timeline drafts.

- Route: `/techdocs-ai-postmortem`
- Agent: `techdocs-ai-postmortem`
- Artifact: `postmortem-draft`

The page accepts one resolved incident ID and renders the chronological timeline,
coverage per evidence source, cited narrative, and explicit gaps. It does not
assign root cause or blame.

The deployed backend is draft-only. Chat, observability, deployment/PR evidence,
publication, incident annotation, and approval controls are unavailable and are
shown only through coverage and limitation states. No publish button is rendered.
