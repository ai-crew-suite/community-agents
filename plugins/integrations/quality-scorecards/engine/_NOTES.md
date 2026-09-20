# Quality Scorecards Provider Notes

## Planned Agentic Workflow Plugins Consuming Quality Scorecards Sibling Plugins

The following proposed agentic workflow plugins consume this plugin:

- `tech-debt-ai-scout`: Scorecards, Soundcheck, and similar are the primary internal compliance target. The _Reporter_ agent uses this backend service to automatically update a component's Tech Debt health score or pass factual metrics to code-quality widgets.
- `tech-radar-ai-manager`: TechRadar is the target interface. The agent interacts with this backend surface to submit proposed changes to quadrants (e.g., Languages, Frameworks) and rings (e.g., Assess, Trial, Adopt, Hold).
