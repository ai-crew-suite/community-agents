# Scaffolder AI Infra (Backend)

Two backend modules for approved-blueprint IaC generation:

- AI Core preview runner: `scaffolder-ai-infra` / `scaffolder-infra`
- Scaffolder action module: `ai:infra:generate`

## Deterministic scope

The runner/action choose a configured approved blueprint by provider, fill only
explicit `{{placeholder}}` holes with validated request values, route output to
a fixed dialect/file name (`main.tf` or `template.yaml`), and validate unresolved
holes, secret material, wildcard IAM, and public ingress before returning or
writing any file.

The action writes only under `ctx.workspacePath`, rejects traversal, honors
dry-run, refuses overwrite by default, and uses the real Scaffolder checkpoint
API. It never provisions infrastructure, creates credentials, opens a PR, or
writes outside the task sandbox.

## Current limitation

This milestone deliberately uses deterministic blueprint-hole rendering rather
than a model generation/correction loop. Catalog ownership tags, duplicate
resource checks, compliance-driver validation, and model-driven bounded
correction require additional confirmed adapters/contracts and are not
fabricated. The preview runner is non-writing; workspace writes happen only in
a real Scaffolder action invocation.

## Configuration

```yaml
ai:
  agents:
    scaffolderInfra:
      model: scaffolder-infra
      blueprints:
        sources:
          - id: approved-terraform
            provider: terraform
            url: https://example.com/approved/main.tf
```
