# Scaffolder AI Intent (Backend)

Read-only AI Core module for schema-backed Scaffolder intent proposals.

- Agent: `scaffolder-ai-intent`
- Workflow: `scaffolder-intent`
- Artifact: `template-intent-proposal`

The module selects only templates from `templates.allowed`, fetches their live
parameter schemas through `scaffolderServiceRef`, and emits only schema-declared
parameters. Catalog component-name collisions become explicit `name_taken` issues.

This first milestone is proposal-only. Correction sessions, approval/resume,
Scaffolder task creation, and execution artifacts are intentionally unavailable;
`scaffold()` is never called.

```yaml
ai:
  agents:
    scaffolderIntent:
      model: scaffolder-intent
      templates:
        allowed: [template:default/react-service-template]
```
