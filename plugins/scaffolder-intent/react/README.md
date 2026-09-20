# Scaffolder AI Intent (Frontend)

Backstage UI for the proposal-only `scaffolder-ai-intent` backend milestone.

- Submits one natural-language provisioning request.
- Streams and replays proposal events using `?run=<run-id>`.
- Displays allow-listed candidates, schema-declared parameters, catalog/schema validation issues, and limitations.

A displayed correction question is informational in this milestone. The backend does
not yet expose correction continuation, confirmation, or Scaffolder task creation,
so this UI deliberately presents no controls for those unavailable actions.
