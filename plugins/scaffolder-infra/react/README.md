# Scaffolder AI Infra (Frontend)

Standalone Backstage page for starting and replaying **non-writing** approved
blueprint infrastructure previews.

## Surface

- `/scaffolder-ai-infra` preview page with `?run=<id>` replay.
- Terraform/CloudFormation provider, service, and region preview form.
- Preview status explicitly states that no workspace write or provisioning occurs.
- Generated file metadata manifest, validation findings, correction count,
  limitations, and retained blueprint evidence.

## Contract boundary

The AI Core backend emits only `infra-generation-report` metadata. It does not
persist generated file contents or expose a report-list endpoint, so this UI
does not invent file-content tabs or a history API. Workspace file writes happen
only inside the real `ai:infra:generate` Scaffolder action, never through this
preview page.
