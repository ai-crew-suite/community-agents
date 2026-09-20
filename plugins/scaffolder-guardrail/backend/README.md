# Scaffolder AI Guardrail Agent (Backend)

AI Core advisory module that evaluates one Scaffolder template request against
configured compliance policy, architecture, and budget boundaries before a
caller submits it to Scaffolder.

- Agent ID: `scaffolder-ai-guardrail-agent`
- Workflow ID: `scaffolder-guardrail`
- Artifacts: `guardrail-assessment`, `guardrail-resolution`

## Deterministic guardrails

The module canonicalizes and redacts request parameters, maps driver violations
through a configuration-owned severity table (unmapped rules are `blocking`),
compares only driver-provided cost values against configured budgets, and derives
instance type alternatives only from configured ladders. Model output cannot
change a verdict, severity, cost, or mutation value.

Negotiable and escalation outcomes checkpoint the frozen assessment and emit an
AI Core `approval_request`. On resume, `compliance.permission.check` verifies
the approver before a `GuardrailResolution` releases approved parameters. The
module registers no write tool and never executes a Scaffolder task.

## Advisory limitation

There is no Scaffolder pre-flight extension point in this repository. The module
is therefore frontend-invoked advisory review; a direct Scaffolder API request
can bypass it. Every assessment records `advisory-only: not enforced
server-side` until the shared pre-flight contract is implemented.

## Configuration

```yaml
ai:
  agents:
    scaffolderGuardrail:
      model: scaffolder-guardrail
      policies:
        - id: corp-architecture
```

See `config.d.ts` for limits, severity mapping, budget, and safe alternative
configuration.
