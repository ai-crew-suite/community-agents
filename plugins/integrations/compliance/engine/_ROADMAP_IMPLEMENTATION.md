# Compliance Module — Aggregated Roadmap Items

No blocking items reported. `compliance.policy.evaluate`, `compliance.architecture.validate`, `compliance.cost.estimate`, and `compliance.permission.check` (all `effect: 'read'`) satisfy the guardrail-agent, rfc-adr-reviewer, and scaffolder-ai-intent plans.

## Watch items (not blockers)

- **Approver authorization policies**: guardrail-agent requires OPA policies covering exception/mutation classes, scoped so a developer cannot approve their own over-budget request unless policy permits; refused approvals must be audited. This is policy authoring/deployment, not driver work.
- **Fail-closed semantics**: consumers rely on absent-driver → `undetermined` (never an implicit pass) and unmapped-rule → `blocking` defaults. Preserve these when evolving the driver contract.
