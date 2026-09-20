# Compliance Provider Notes

## Planned Agentic Workflow Plugins Consuming Compliance Sibling Plugins

The following proposed agentic workflow plugins consume this plugin:

- `scaffolder-ai-guardrail-agent`: FinOps / Cost Accounting Database and similar are queried by the agent to evaluate the projected monthly cloud burn rate based on selected compute and storage parameters.
- `scaffolder-ai-guardrail-agent`: OPA Policies and similar provides active enterprise compliance blueprints (such as mandatory token rotation rules or restricted VPC networks).
- `scaffolder-ai-infra`: Policy Registries are evaluated by the role nodes to verify that variable metrics (such as allowing public access blocks or provisioning non-standard storage sizes) do not violate enterprise platform engineering guardrails.
