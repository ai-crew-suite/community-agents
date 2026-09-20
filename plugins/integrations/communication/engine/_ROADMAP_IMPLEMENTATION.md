# Communication Module — Aggregated Roadmap Items

## 1. Message posting (write) behind approval policy

- **Item**: `communication.message.post` (`effect: 'write'`) for Slack/channel dispatch, exercised through AI Core's approval policy with explicit config opt-in.
- **Consumers (all v1.1, deliberately deferred)**: catalog-ai-insights (nightly scan digest), oncall-ai-handover-assistant (brief dispatch), scaffolder-ai-drift-detector (owner notification). `communication.channel.lookup` (read) already exists and is consumed by scaffolder-ai-shadow-detective.
- **Note**: verify the tool's current registration status before scheduling work; the workflow plans treat it as not-yet-available and forbid fabricating it.
