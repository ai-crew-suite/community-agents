# Scaffolder AI Shadow Detective (Backend)

Read-only AI Core module for cloud-to-catalog shadow-resource reports.

- Agent: `scaffolder-ai-shadow-detective`
- Workflow: `shadow-reconciliation`
- Artifact: `shadow-resource-report`

It inventories resources through the normalized `cloud.resource.lookup` tool, filters
exact catalog bindings, resolves configured owner tags only to existing catalog groups,
and builds human-click claim URLs. The current milestone performs no cloud or catalog
writes, scheduled scans, cursor resume, dedupe, or outreach.
