# Observability Provider Notes

## Planned Agentic Workflow Plugins Consuming Observability Sibling Plugins

The following proposed agentic workflow plugins consume this plugin:

- `catalog-ai-insights`: Datadog, New Relic, Splunk, and similar provide dashboard links or recent error log anomalies.
- `kubernetes-ai-responder`: Datadog, OpenTelemetry, Jaeger, and similar provide API hooks to scan recent distributed trace anomalies or error-rate spikes matching the failing service's timeline.
- `techdocs-ai-postmortem`: Datadog, Splunk, and similar are extracted by the Log Gatherer node to identify error spikes or alert triggers.

## Related

On-call schedules, paging metadata, and incident lifecycles moved to
`plugin-ai-core-backend-module-incident-management`.
