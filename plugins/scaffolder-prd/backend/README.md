# Scaffolder AI PRD (Backend)

Blueprint-only AI Core module for cited PRD delivery planning.

- Agent: `scaffolder-ai-prd`
- Workflow: `scaffolder-prd`
- Artifact: `delivery-blueprint`

The first milestone parses one inline PRD, emits concurrent PM/Engineer/Writer
progress channels, and merges cited epic/story, template, and documentation-outline
outputs. It does not query external sources or create tickets, Scaffolder tasks, or
documentation changes.
