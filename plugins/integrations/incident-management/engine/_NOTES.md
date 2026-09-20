# Incident Management Provider Notes

## Planned Agentic Workflow Plugins Consuming Incident Management Sibling Plugins

The following proposed agentic workflow plugins consume this plugin:

- `alert-ai-tuner`: PagerDuty, Opsgenie, and similar provide the history of triggered alerts, including timestamps for when they opened and closed, and whether they were resolved automatically or manually.
- `catalog-ai-insights`: PagerDuty, Opsgenie, and similar provide the source data for _"Who is the on-call?"_.
- `oncall-ai-handover-assistant`: PagerDuty, Opsgenie, and similar provide the volume of alerts, specific alert definitions, and paging event metadata triggered during the departing shift.
- `techdocs-ai-postmortem`: PagerDuty, Opsgenie, and similar provides the baseline incident metrics (start/end timestamps, team assignment, core responder notes).

## Related

Metrics, logs, traces, and dashboards live in
`plugin-ai-core-backend-module-observability`.
