# On-Call AI Handover Assistant (Backend)

AI Core backend module that compiles a bounded, replayable on-call handover
brief. Each run validates a scoped trailing window, gathers configured
read-only operational signals, deterministically clusters repeated incidents,
optionally enriches clusters with runbook context, and persists an
`oncall-handover-brief` artifact.

## Configuration

```yaml
ai:
  agents:
    oncallHandover:
      model: oncall-handover
      windowHours: 12
      maxWindowHours: 48
      maxSignalsPerSource: 100
      maxClusters: 25
      maxEnrichedClusters: 5
      maxToolInvocations: 16
      schedule:
        enabled: false
        shifts:
          - cron: '0 8 * * *'
            team: sre-primary
```

`team` or `entityRefs` is required for every manual request. The scheduler is
opt-in and dispatches authenticated runs through AI Core, so scheduled briefs
use the same persisted, replayable event and artifact path as manual runs.

## Safety boundaries

The agent allow-list contains only read tools. Missing drivers, unavailable
sources, exhausted budgets, and failed retrieval are represented as brief
limitations rather than causing a write or an unbounded scan.
