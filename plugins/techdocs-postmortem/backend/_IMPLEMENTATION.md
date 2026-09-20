# TechDocs AI Postmortem Implementation Plan

## Overview

This plugin aggregates timeline sequences from Slack channels, incident management systems, and monitoring platforms to automatically draft comprehensive post-mortem incidents.

- **The Task**: Drafting post-incident timelines automatically inside Backstage TechDocs.
- **The Logic**: Following a PagerDuty resolution event, a stateful LangGraph multi-agent network (Log Gatherer node \(\rightarrow \) Timeline Writer node) queries Datadog metrics, GitHub PR histories, and Slack transcripts to compile a sequential "Timeline of Events." It halts at an in-memory or database checkpoint for human approval before committing the final Markdown document.

## Goal

Implement `@ai-crew-suite/plugin-agent-techdocs-postmortem-backend` as an AI Core backend module that turns a resolved incident into a cited **Timeline of Events** draft. A gather stage pulls timestamped evidence from four independent sources — incident notes and lifecycle timestamps, alert firings, metric/log spikes, deploy and PR activity, and the responders' chat transcript — then a deterministic merge orders every item on one clock, collapses duplicates, and marks gaps. A single model call writes the narrative from that ordered bundle, citing an evidence ID for every sentence. The draft freezes at a human approval checkpoint before any markdown is committed. A paired frontend plugin renders the incident picker, the merged timeline, the cited narrative, and the approval bar.

Reuse the architecture proven by `plugin-ai-agent-backend-catalog-ai-insights` (its `_IMPLEMENTATION.md` is the source of truth for repository conventions, workflow-runner mechanics, event contracts, monorepo wiring, and test-layer definitions), and reuse the **implemented** multi-source evidence pattern from `plugin-ai-agent-backend-oncall-ai-handover-assistant` — its `workflow/collectors.ts` (`RawSignal` per-source collection), `workflow/window.ts` (`resolveWindow`), and `workflow/clustering.ts` already solve bounded multi-source gathering with graceful per-source degradation. This plan documents only what differs: **chronological merge and gap detection**, **transcript handling as sensitive human speech**, and the **approval-gated documentation commit**.

## Delivery Boundary

### In scope

- One resolved incident per run, via `/agents/techdocs-ai-postmortem/runs`, scoped to the incident's own lifecycle window plus configurable padding.
- Deterministic `resolve → window → gather → merge → narrate → gate` pipeline realizing the foundation doc's Log Gatherer → Timeline Writer split. Window derivation, per-source collection, chronological ordering, dedupe, and gap detection are pure code; the model writes only prose over the ordered bundle.
- Bounded reads across four sources: `incident.incident.get` (notes, lifecycle timestamps), `incident.alert.history`, `observability.metrics.query`/`logs.search`, `vcs.pull_request.list`, and `communication.channel.history`.
- A `PostmortemDraft` artifact: an ordered `TimelineEvent[]` where every entry carries a source, an ISO timestamp, and an `ev-N` ID, plus a narrative in which **every** claim cites those IDs.
- Explicit **gap and degradation reporting** — a missing source is named, never silently omitted, and a coverage summary states which sources contributed.
- Approval-gated publication: a ticket carrying the markdown today, and a documentation PR once `vcs.pull_request.create` lands.

### Explicitly out of scope for v1

- **Autonomous publication.** No markdown is committed and no PR opened without a persisted human approval; `publish.mode` defaults to `none`. A postmortem is an organizational artifact — publishing an unreviewed one would be worse than publishing nothing.
- **Event-triggered runs on PagerDuty resolution.** `coreServices.events` does not exist in this repo (see Prerequisites), so v1 is manual/scheduled. The request contract keeps an `event` variant reserved.
- **Root-cause analysis or blame.** The plugin authors a *timeline*, not a verdict. It never asserts why the incident happened, never names a person as a cause, and never proposes corrective actions as fact — those are the human's job in review.
- Writing the "Five Whys", impact quantification, or SLO-burn math from inference. Numbers appear only when a source supplied them.
- Editing an existing postmortem document. v1 drafts a new one; amending prior prose is out.
- Multi-incident or aggregate retrospectives; one incident per run.

## Required Prerequisites

Contracts verified against the current codebase. As with the catalog plan: no fictional service refs — the foundation doc's `slack.service` sketch (`getChannelHistory` on an invented ref) must **not** be implemented as written; the real contract is the `communication.channel.history` tool over `CommunicationDriver`.

**Both of the earlier draft's gates are confirmed, and every read source it needed exists.** Verified:

- **Every evidence source is available today.** `incident.incident.get` returns `IncidentDetail` with `triggeredAt`/`acknowledgedAt`/`resolvedAt` **and** `notes: IncidentNote[]` (each with `author` + `createdAt`); `incident.alert.history` returns timestamped firings; `observability.metrics.query`/`logs.search` cover the spike signals; `vcs.pull_request.list` covers deploy activity; `communication.channel.history` returns `CommunicationMessage[]` with `author`, `text`, `createdAt`, and `url`. **Every source is already timestamped**, which is exactly what a chronological merge needs — no timestamp inference required.
- **Events — CONFIRMED MISSING.** Zero references to `coreServices.events` / `eventsServiceRef` anywhere, so the PagerDuty-resolution hook cannot be wired.
- **Documentation write — CONFIRMED MISSING.** All four `vcs.*` tools are `effect: 'read'`; `VcsDriver` has no write op. Draft generation works; committing markdown does not.

| Capability | Required contract | Current state | Required action |
| --- | --- | --- | --- |
| Incident spine | `incident.incident.get` → `IncidentDetail` | **Exists**, `effect: read`; carries `triggeredAt`/`acknowledgedAt`/`resolvedAt`, `severity`, `assignees`, and **`notes: IncidentNote[]`** with per-note `author`/`createdAt` | The authoritative backbone. Lifecycle timestamps derive the window; notes are first-class timeline events. Replaces any invented incident shape. |
| Incident discovery | `incident.incident.list` | Exists, `effect: read` | Populate the frontend incident picker with recently resolved incidents. |
| Alert firings | `incident.alert.history` | **Exists**, `effect: read`; `AlertHistoryEntry` has `triggeredAt`/`resolvedAt`/`resolution` | The detection edge of the timeline: when monitoring first fired. |
| Metric / log spikes | `observability.metrics.query`, `observability.logs.search` | **Exist**, `effect: read` (Datadog driver) | The foundation doc's Datadog signals. Bounded by the same window; store **summaries and links**, not raw log volume. |
| Deploy / change activity | `vcs.pull_request.list` | Exists, `effect: read`. **Note the contract limit**: it takes only `repoUrl` — no time window, no state filter | Fetch then **filter client-side** to the incident window, recording the over-fetch as a limitation. The windowed-PR extension is shared work (see `search-ai-archeology`). |
| Responder transcript | `communication.channel.history` → `MessageHistoryQuery { channelId, threadId?, since?, limit? }` | **Exists**, `effect: read`; returns `CommunicationMessage[]` with `author`, `text`, `createdAt`, `url` | Replaces the invented `slack.service`. `since` bounds the read natively; `limit` is clamped. Treat message text as **sensitive human speech** (see Guardrails). |
| Channel resolution | `communication.channel.lookup` | Exists, `effect: read` | Resolve the incident's team/service to a channel when the caller does not supply one. |
| Component + docs location | `CatalogEntityResolver` (`getEntitySummary`, `getIntegrationReferences` → `techdocsRef`, `repositories`) | **Exists** in `plugin-ai-core-node/src/catalog/` | Resolve the affected component, its repository, and where postmortems live. |
| Prior postmortems / templates | `knowledge.retrieve`, `coreServices.urlReader` | Exist | Optional: house postmortem template and precedent for tone. **Never** contributes a timeline event. |
| **Documentation commit (write)** | `vcs.pull_request.create` (**new, `effect: 'write'`**) | **Not present** — no write-capable VCS tool | Add `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` to `VcsDriver` + register the tool. **Now needed by five plugins** — build once in `plugin-ai-core-backend-module-vcs`. **Blocking for PR publication only.** |
| Interim publication | `project.ticket.create` | **Exists**, `effect: 'write'` | Bridge: file a ticket carrying the full markdown draft so a human can commit it. Approval-gated, same as the PR path. |
| Incident cross-link | `incident.incident.annotate` | **Exists**, `effect: 'write'` | Optional post-approval: annotate the incident with the postmortem link, closing the loop. Approval-gated. |
| **Resolution trigger** | An events subscription | **Missing entirely** | Defer. Keep `PostmortemRequest.source` discriminated so an `event` variant is additive; v1 uses manual runs plus an optional sweep over recently-resolved incidents. |
| Approval gate | `ApprovalRequest` / `ApprovalDecision`, `WorkflowRunner.resume()`, `CheckpointStore`, `AuditLogSink` | **Exist** | Implement `PostmortemGraph.resume()` — the foundation doc's `PENDING_APPROVAL` checkpoint; audit decision, actor, and draft hash. |
| Multi-source collection pattern | Per-source collectors with graceful degradation | **Implemented precedent** — `oncall-ai-handover-assistant/src/workflow/collectors.ts` + `window.ts` | Follow it directly; do not invent a second collection idiom. |
## Package Shape

Backend module from the same template as `catalog-ai-insights`, with a `workflow/` layout deliberately parallel to the **implemented** `oncall-ai-handover-assistant` (`collectors.ts`, `window.ts`, graph, state) so the two evidence-gathering agents stay recognizably the same shape. Every directory carries a barrel `index.ts` re-exporting its public surface, matching the reference plugin's export styling.

```text
plugins/backend/plugin-ai-agent-backend-techdocs-ai-postmortem/
  package.json          # role: backend-plugin-module, pluginId: ai-core
  tsconfig.json
  config.d.ts
  README.md
  src/
    index.ts            # barrel: module default + public types
    module.ts           # registers runner, agent, triggers, optional sweep
    agent.ts            # TECHDOCS_POSTMORTEM_AGENT_ID, tool allow-list, system prompt
    config.ts           # readPostmortemConfig (ai.agents.techDocsPostmortem)
    workflow/
      index.ts          # barrel
      PostmortemGraph.ts        # WorkflowRunner id 'postmortem-timeline' (run + resume)
      state.ts                  # PostmortemState (incident, window, events, draft)
      request.ts                # pure: PostmortemRequest validation + normalization
      window.ts                 # pure: incident lifecycle -> bounded TimeRange + padding
      collectors.ts             # per-source gathering -> TimelineEvent[] (mirrors oncall)
      merge.ts                  # pure: multi-source events -> ordered, deduped timeline
      gaps.ts                   # pure: ordered timeline -> silence windows + coverage
      draft.ts                  # PostmortemDraft schema, citation validation, degradation
      publish.ts                # approval-gated ticket/PR publication executor
    services/
      index.ts          # barrel
      IncidentResolver.ts       # incident.* adapter: detail, notes, alert history
      TranscriptReader.ts       # communication.* adapter: channel resolve + bounded history
      DocsTargetResolver.ts     # CatalogEntityResolver adapter: repo + techdocsRef
      PostmortemToolRunner.ts   # capped invokeTool facade, per-source error classing
      PostmortemArtifactWriter.ts
    scheduler/
      index.ts          # barrel
      resolvedSweep.ts          # optional: recently-resolved incidents without a draft
      sweepPlanner.ts           # pure: incident list + caps -> bounded dispatch plan
    @types/
      index.ts          # barrel: shared request/event/draft contracts
    __tests__/
    workflow/__tests__/
    services/__tests__/
    scheduler/__tests__/
```

- `createBackendModule` with `pluginId: 'ai-core'`, `moduleId: 'agent-techdocs-ai-postmortem'`.
- `module.ts` deps: `coreServices.rootConfig`, `coreServices.logger`, `coreServices.scheduler`, `coreServices.urlReader`, `coreServices.discovery`, `coreServices.auth`, `catalogServiceRef`, plus `agentExtensionPoint`, `triggerExtensionPoint`, `workflowRunnerExtensionPoint`. **No new core service keys are introduced**, and `coreServices.events` is not referenced because it does not exist.
- Package naming, scripts, Apache header, root `tsconfig.json` references, and `.eslintrc.cjs` role overrides follow `catalog-ai-insights` and `plugin-registration.md` verbatim (not repeated here).

## Monorepo And App Wiring

Same delegated-but-verified steps as `catalog-ai-insights` (see that plan's "Monorepo And App Wiring"). Deltas:

- **Backend load**: add `"@ai-crew-suite/plugin-agent-techdocs-postmortem-backend": "workspace:^"` to `packages/backend/package.json` and the matching `backend.add(loadBackendFeature(import(...)))` line in `packages/backend/src/index.ts`.
- **Driver gates are all soft, and each maps to a named timeline gap.** Incident detail needs the incident-management module + PagerDuty driver (without it there is no spine, so the run terminates `incident_unavailable`); observability, VCS, and communication drivers each contribute one evidence class and degrade to a recorded gap. A draft built from incident notes alone is still useful — and honest about being partial.
- **Publication is gated, drafting is not.** With no `vcs.pull_request.create`, set `publish.mode: 'ticket'` to deliver the markdown via `project.ticket.create`, or `'none'` for draft-only.
- **App config**: the module throws at boot without `ai.agents.techDocsPostmortem.model`; add the config block (see Configuration). The sweep needs `sweep.enabled: true`; publication needs `publish.mode` plus its tool.
- **Frontend registration**: `plugins/frontend/plugin-ai-agent-frontend-techdocs-ai-postmortem/` exists but is **empty** — scaffold it from scratch. Add the workspace dependency to `packages/app/package.json`, import its `/alpha` default export in `packages/app/src/App.tsx`, and extend plugin-ID expectations in `packages/app/src/App.test.tsx`.
- **Yarn PnP refresh**: `yarn install` after any `package.json` edit, then `yarn typecheck --force` / `yarn lint --force`.

## Agent Definition

```ts
{
  id: 'techdocs-ai-postmortem',
  modelRef: config.modelRef,          // installation-registered ID, e.g. 'techdocs-postmortem'
  workflowRef: 'postmortem-timeline',
  memory: 'none',                     // each incident is a self-contained evidence bundle
  systemPrompt: TECHDOCS_POSTMORTEM_SYSTEM_PROMPT,
  toolIds: [
    'incident.incident.get',
    'incident.incident.list',
    'incident.alert.history',
    'observability.metrics.query',
    'observability.logs.search',
    'vcs.pull_request.list',
    'communication.channel.lookup',
    'communication.channel.history',
    'knowledge.retrieve',
    'project.ticket.create',          // effect: 'write' — post-approval only
    'incident.incident.annotate',     // effect: 'write' — post-approval only
    // 'vcs.pull_request.create'      // effect: 'write' — NEW; add when it lands
  ],
  triggers: [
    { id: 'postmortem-draft-on-demand', source: 'manual', agentId: 'techdocs-ai-postmortem' },
    { id: 'postmortem-resolved-sweep', source: 'scheduler', agentId: 'techdocs-ai-postmortem' },
  ],
}
```

- Read tools run freely. Both write tools are `effect: 'write'`, so AI Core pauses with an `approval_request` before either executes. `vcs.pull_request.create` is commented out because it **does not exist** — an unknown allow-list entry fails fast at boot, so it is added only when the tool lands.
- `communication.message.post` is **deliberately not allow-listed**: this agent reads a transcript to build a timeline; posting back into the incident channel is a different plugin's job and would let it broadcast draft prose to responders.
- Catalog access goes through the injected `CatalogEntityResolver`, not a tool.
- `memory: 'none'` — each incident is self-contained, and carrying prior incidents forward risks bleeding one postmortem's details into another's narrative.
- System prompt rules, deliberately strict because this text becomes an organizational record: write **only** from the supplied ordered timeline; cite an `ev-N` ID for **every** sentence containing a fact; never infer a cause, assign blame, or name a person as responsible — attribute actions to what a source recorded ("`ev-7`: dev-beta reported applying a hotfix") and nothing more; never invent a timestamp, metric value, PR number, or quotation; say *"no data available for this source"* for a reported gap rather than smoothing over it; do not write conclusions, action items, or Five-Whys content — those sections are left as headed placeholders for humans.

## Run Input Contract

The generic `AgentRunInput.input.query` carries a versioned JSON payload. `source` is discriminated so an `event` variant is additive when an events contract lands.

```ts
type PostmortemRequest = {
  version: 1;
  source: 'manual' | 'scheduler';   // 'event' reserved; see Prerequisites
  incidentId: string;            // required: the resolved incident to document
  entityRef?: string;            // affected component; else derived from the incident service
  channelId?: string;            // transcript channel; else resolved via channel.lookup
  window?: { since?: string; until?: string };  // override; else derived from lifecycle
  paddingMinutes?: number;       // pre/post padding around the incident, clamped
  sources?: ('incident' | 'alerts' | 'observability' | 'changes' | 'chat')[];  // default all
  publish?: boolean;             // request the publication path (still gated); default false
};
```

Validation requires `incidentId`, clamps `paddingMinutes` and every per-source `limit`, restricts `sources` to configured ones, rejects a `window` wider than `maxWindowHours`, and forces publication through the approval gate regardless of caller.

## Postmortem Workflow

`PostmortemGraph` registers as `WorkflowRunner` id `postmortem-timeline` and implements **both** `run()` and `resume()`. It realizes the foundation doc's **Log Gatherer → Timeline Writer** split with an approval checkpoint between writing and committing. Collection, ordering, and gap detection are deterministic; the model writes prose over a frozen bundle.

### Deterministic graph nodes

1. **resolve** — validate `PostmortemRequest`; `IncidentResolver` fetches `IncidentDetail` via `incident.incident.get`. This is the **spine**: without it there is no authoritative clock, so an unresolvable incident terminates as `incident_unavailable` with **no** model call. An incident with no `resolvedAt` terminates as `incident_open` — a postmortem for an ongoing incident would be premature.
2. **window** — `window.ts` (pure) derives the bounded `TimeRange` from `triggeredAt`/`resolvedAt` plus `paddingMinutes`, clamped to `maxWindowHours`. Every downstream source uses this one window, which is what makes the merged timeline coherent.
3. **gather** *(Log Gatherer)* — `collectors.ts` collects per source into `TimelineEvent[]`, following the implemented `oncall-ai-handover-assistant` pattern: incident lifecycle transitions and `notes` (`ev-N`), alert firings, metric/log spike summaries, PRs merged in-window (fetched then **filtered client-side**, since `listPullRequests` takes no window), and the chat transcript via `communication.channel.history` bounded by `since` + `limit`. Each source is wrapped so a failure or missing driver becomes a **named gap**, never an aborted run. Per-source progress emits node-tagged `step` events.
4. **merge** — `merge.ts` (pure, no LLM) sorts all events on one clock and collapses duplicates: an alert and its incident-trigger note within `dedupeWindowSeconds` describing the same alert become one event with both citations retained. Ties break deterministically (timestamp, then source priority, then stable ID) so two runs over identical evidence produce an identical timeline. Events missing a timestamp go into an explicit `undated` bucket rather than being guessed into position.
5. **gaps** — `gaps.ts` (pure) computes coverage: which sources contributed, which are absent and why, and any silence window longer than `gapThresholdMinutes` between consecutive events. A postmortem's blind spots matter as much as its facts, so they are computed rather than left implicit.
6. **narrate** *(Timeline Writer)* — one model call renders the ordered bundle into markdown using the configured template: a **Timeline of Events** table plus a prose summary, with headed placeholders for Root Cause / Action Items left for humans. `draft.ts` re-validates that every factual sentence carries an `ev-N` citation resolving to a supplied event, stripping or degrading uncited prose. Emits the `postmortem-draft` artifact.
7. **gate** — when `publish` is requested, the configured publication tool is registered, and `publish.mode` is not `none`, emit `approval_request` carrying the full markdown, the timeline, the coverage summary, and a `draftHash`; checkpoint and **suspend**. This is the foundation doc's `PENDING_APPROVAL` state. Draft-only runs finish at the artifact.
8. **publish** *(resume path)* — `resume(runId, decision, context)`: on `approved`, deliver per `publish.mode` (a ticket carrying the markdown, or a documentation PR once the tool exists), optionally annotate the incident with the resulting link via `incident.incident.annotate`, emit a `postmortem-publication` artifact plus audit entry, and finish `published`/`partially_published`; on `rejected`, record the decision and finish `draft_only`.

### State and output schema

```ts
type EvidenceRef = { id: string; source: TimelineEvent['source']; summary: string; reference?: string };

type TimelineEvent = {
  id: string;                    // 'ev-1' ... assigned after the deterministic sort
  at?: string;                   // ISO-8601; absent means the undated bucket
  source: 'incident' | 'alert' | 'observability' | 'change' | 'chat';
  kind: 'triggered' | 'acknowledged' | 'resolved' | 'note' | 'alert_fired'
      | 'metric_spike' | 'log_spike' | 'pr_merged' | 'message';
  actor?: ServiceActor;          // who, when the source recorded one
  summary: string;               // one-line, redacted, bounded
  detail?: string;               // bounded excerpt (message text, note body)
  reference?: string;            // deep link: incident, alert, PR, dashboard, message URL
  mergedFrom?: string[];         // citations retained when duplicates collapsed
};

type SourceCoverage = {
  source: TimelineEvent['source'];
  status: 'collected' | 'unavailable' | 'empty' | 'truncated';
  eventCount: number;
  reason?: string;               // why unavailable/truncated
};

type TimelineGap = {
  fromEventId: string;
  toEventId: string;
  minutes: number;               // silence longer than gapThresholdMinutes
};

// PostmortemState: { request, incident, window, events: TimelineEvent[],
//   undated: TimelineEvent[], coverage: SourceCoverage[], gaps: TimelineGap[],
//   markdown?, draftHash?, limitations: string[],
//   status: 'draft_only'|'awaiting_approval'|'published'|'partially_published'
//         |'incident_unavailable'|'incident_open'|'no_evidence'|'partial' }

type PostmortemDraft = {
  incidentId: string;
  incidentUrl?: string;
  severity?: string;
  window: { since: string; until: string };
  durationMinutes?: number;      // from lifecycle timestamps only, never estimated
  events: TimelineEvent[];       // chronologically ordered
  undated: TimelineEvent[];      // explicitly separated, never interleaved by guess
  coverage: SourceCoverage[];    // every configured source, contributing or not
  gaps: TimelineGap[];
  markdown: string;              // the rendered document, citations validated
  status: PostmortemState['status'];
  limitations: string[];         // e.g. 'chat transcript unavailable'
  evidence: EvidenceRef[];
};

type PostmortemPublication = {
  draftRef: string;              // artifact ref of the approved draft
  draftHash: string;
  approvedBy: string;
  mode: 'ticket' | 'pull_request';
  reference: string;             // ticket key or PR URL
  incidentAnnotated: boolean;
  failures: { target: string; reason: string }[];
  outcome: 'published' | 'partially_published';
};
```

Status mapping is fixed in code, not inferred: incident unreadable → `incident_unavailable`; incident still open → `incident_open`; spine present but every other source empty/unavailable → `no_evidence`; any source `unavailable`/`truncated` → `partial` with the source named; drafted with publication disabled or rejected → `draft_only`; approved and delivered → `published`; approved with the annotate step failing → `partially_published`.

## Deterministic Chronological Merge (New Structural Section)

The timeline **is** the product, so its ordering is arithmetic over already-timestamped sources rather than model reasoning.

- Every source already carries timestamps (`IncidentDetail` lifecycle fields and `notes[].createdAt`, `AlertHistoryEntry.triggeredAt`, `CommunicationMessage.createdAt`, PR merge times), so `merge.ts` never infers *when* something happened — the most consequential kind of hallucination in a postmortem.
- `merge.ts` is pure: `(events, config) => { ordered, undated, gaps }`. No AI Core, tool, or clock dependency, so ordering, dedupe, and tie-breaking are unit-testable on fixture events.
- **Deterministic tie-breaking** (timestamp → source priority → stable ID) means two runs over identical evidence produce byte-identical timelines. That matters because a postmortem gets re-generated and compared during review.
- **Dedupe retains citations rather than discarding them.** An alert firing and the incident note announcing it collapse into one event whose `mergedFrom` lists both IDs, so the narrative can still cite either source and a reviewer can see the collapse happened.
- **Undated events are quarantined, not placed.** A source that returns an item without a usable timestamp goes into an explicit `undated` bucket. Slotting it "approximately" would fabricate sequence — and sequence is exactly what readers draw causal conclusions from.
- `ev-N` IDs are assigned **after** the sort, so citation numbers read in chronological order in the finished document.

## Gap And Coverage Reporting (New Structural Section)

A postmortem that silently omits a source is worse than one that admits the omission, because readers assume completeness.

- `gaps.ts` (pure) produces two distinct things: **source coverage** (which of the configured sources contributed, and why any did not) and **timeline gaps** (silence windows longer than `gapThresholdMinutes`).
- Source coverage distinguishes `unavailable` (no driver / call failed) from `empty` (queried successfully, nothing in the window) from `truncated` (hit a `limit`). Conflating these would let "we could not read Slack" read as "nobody said anything" — a materially different postmortem.
- Coverage is rendered **inside the document**, not just the artifact, so the published markdown itself carries its provenance and blind spots for anyone reading it later without the run.
- A silence window is reported as a *fact about the evidence*, never interpreted. The plugin does not speculate that nothing happened during a gap, because responders frequently work without narrating.
- `no_evidence` is a first-class status: the incident spine resolved but no other source contributed, so the draft is a bare lifecycle skeleton and says so rather than padding with prose.

## Blameless-By-Construction Narration (New Structural Section)

A postmortem names people doing things under pressure and becomes a durable organizational record, so the plugin's most important constraint is what it refuses to write.

- **The model receives a frozen, ordered bundle and writes prose over it.** It cannot add an event, change a timestamp, or reorder anything — the timeline is computed before narration begins.
- **No causal claims.** The prompt forbids "the outage was caused by", "X broke Y", and similar constructions; the plugin attributes only what a source recorded, in the source's own framing. Root Cause and Action Items are emitted as **headed placeholders** for humans, because a plausible-sounding root cause is exactly the kind of confident error that survives into a permanent document.
- **No blame attribution.** Actors appear as recorded actors of recorded actions ("`ev-7`: dev-beta reported applying a hotfix"), never as agents of failure. `draft.ts` rejects prose that associates a person with a fault framing.
- **Citation validation is enforced, not requested.** Every factual sentence must carry an `ev-N` that resolves to a supplied event; uncited factual prose is stripped and the draft degrades to a timeline-plus-coverage document rather than shipping unverifiable narrative.
- Quotations from chat are **exact or absent** — the model may not paraphrase a person's words into something they did not say, and `detail` excerpts are length-capped and carry a message `url` so a reader can check.
- The generated document is explicitly labelled a **draft** with its coverage summary attached, so a reviewer approving it knows precisely which evidence it rests on.

## Transcript Handling (New Structural Section)

Chat history is the richest source here and the most sensitive, so it gets its own rules.

- `TranscriptReader` bounds every read natively: `MessageHistoryQuery.since` is set from the incident window and `limit` is clamped by `maxMessages`. A `threadId` is used when the caller supplies one, keeping the read to the incident thread rather than the whole channel.
- **Only the incident window is read.** The plugin never reads a channel's broader history, so adjacent unrelated conversation stays out of scope by construction.
- Message text is **redacted before it enters model context, SSE, artifacts, or the draft**: secret-shaped strings scrubbed, `detail` capped at `maxMessageChars`. Incident channels routinely contain pasted credentials, tokens, and customer identifiers.
- Messages are treated as **untrusted prompt input** — delimited with an instruction not to follow embedded directives, since "ignore previous instructions" in a chat message is a realistic injection vector.
- **Off-topic and social messages are dropped by the collector**, not summarized: only messages within the window are collected, and the narrative cites only those it uses. Human speech during an incident is not fair game for characterization.
- Transcript unavailability is a **named gap**, never silently treated as "no discussion occurred".

## Vector Store Integration

- **No new vector infrastructure and no new indexing.** `knowledge.retrieve` reads the existing corpus (the house postmortem template, prior postmortems for tone/structure) owned by `plugin-ai-core-backend-module-retrieval-augmenter`; run/checkpoint state lives in `plugin-ai-core-backend-module-runtime-store`.
- Retrieval affects **structure and tone only** and is structurally barred from `merge.ts`/`gaps.ts`, which receive collected events and config — never retrieval output. Tests assert the timeline and coverage are byte-identical with retrieval on and off.
- **Never index the draft, the transcript, or timeline events.** They contain named individuals discussing failures under pressure; embedding them would create a durable, searchable record of people's worst days outside the review process that governs the document itself. This is the strongest no-index rule in the suite and it is deliberate.

## Background Scheduler Tasks (Optional Resolved-Incident Sweep)

Because the event hook is unavailable, an optional sweep approximates "draft on resolution" without pretending to be event-driven.

- `scheduler/resolvedSweep.ts` registers one optional `coreServices.scheduler` task: `id: 'postmortem-resolved-sweep'`, `frequency: { cron }` from config (default `0 * * * *`), bounded `timeout`, non-zero `initialDelay`, `scope: 'global'`.
- `sweepPlanner.ts` (pure) queries `incident.incident.list` for incidents resolved within the lookback window, filters to those at or above `sweep.minSeverity`, skips any that already have a draft artifact, caps at `maxSweepIncidents`, and emits a dispatch plan.
- The task POSTs one run per incident to `/agents/techdocs-ai-postmortem/runs` via `auth.getPluginRequestToken` + `discovery.getBaseUrl('ai-core')` with `source: 'scheduler'`, `publish: true`. It never executes the graph in-process.
- **Sweeps stop at the approval gate and never publish autonomously** — the service principal holds no approval authority, so an unapproved draft waits as a pending artifact. A cron that auto-published postmortems would be indefensible.
- Guardrails: global mutex, severity floor, per-incident dedupe against existing drafts, sequential dispatch with delay, and kill switch `sweep.enabled` (default **false**).

## Configuration

```yaml
ai:
  agents:
    techDocsPostmortem:
      model: techdocs-postmortem    # installation-registered model ID, required
      maxWindowHours: 24            # optional, default 24 hard clamp on the window
      paddingMinutes: 30            # optional, default 30 pre/post incident padding
      maxToolInvocations: 20        # optional, default 20
      runTimeoutSeconds: 300        # optional, default 300 wall-clock budget
      sources:                      # per-source enablement and caps
        incident: true              # the spine; disabling it is a config error
        alerts: true
        observability: true
        changes: true               # PR activity, filtered client-side
        chat: true
      limits:
        maxEvents: 200              # optional, default 200 merged timeline events
        maxMessages: 300            # optional, default 300 transcript messages
        maxMessageChars: 500        # optional, default 500 per message excerpt
        maxPullRequests: 50         # optional, default 50 before window filtering
      merge:
        dedupeWindowSeconds: 60     # optional, default 60 for cross-source collapse
        sourcePriority: ['incident', 'alert', 'observability', 'change', 'chat']
        gapThresholdMinutes: 15     # optional, default 15 before reporting silence
      template:
        path: ''                    # optional markdown template; else built-in
        docsPath: 'docs/postmortems' # optional target directory for the draft
        includeCoverageSection: true # optional, default true; keep provenance in the doc
      publish:
        mode: none                  # 'none' | 'ticket' | 'pull_request'; default none
        branchPrefix: postmortem    # optional, for pull_request mode
        ticketLabels: ['postmortem', 'incident-review']
        annotateIncident: true      # optional, default true; cross-link after publication
      sweep:
        enabled: false              # optional, default false
        cron: '0 * * * *'           # optional, default hourly
        lookbackHours: 6            # optional, default 6
        minSeverity: SEV2           # optional; only draft for incidents at/above this
        maxSweepIncidents: 5        # optional, default 5 per tick
```

`config.ts` mirrors `readCatalogAiInsightsConfig`: throw when the section or `model` is absent; document every default in `config.d.ts`. Validate at boot that `sources.incident` is `true` (it is the spine — a postmortem without the incident record has no clock), that `publish.mode: 'pull_request'` has its tool registered (**fail startup** rather than silently degrading), that `'ticket'` mode has a project-management driver, and that `sourcePriority` lists every enabled source exactly once so merge tie-breaking is total.

## Shared AI-Core Work To Build First

- **Nothing blocks drafting.** Every read source, the approval machinery, checkpoints, and `resume()` exist today, and `project.ticket.create` provides a working publication path. This plugin can deliver end-to-end value in v1.
- **Blocking for PR publication — `vcs.pull_request.create`.** Add `createPullRequest(repoUrl, { baseBranch, headBranch, title, body, files })` to `VcsDriver` and register the tool with `effect: 'write'`. **This is now needed by five plugins** (`alert-ai-tuner`, `scaffolder-ai-drift-detector`, `scaffolder-ai-prd`, `techdocs-ai-janitor`, and this one) and is the highest-leverage remaining shared task in the suite. Build once in `plugin-ai-core-backend-module-vcs`.
- **Recommended — windowed `listPullRequests`.** Adding optional `{ since?, until?, state? }` (already proposed by `search-ai-archeology`) removes this plugin's fetch-then-filter over-fetch and its associated limitation. Additive and backward compatible.
- **Deferred — the events contract** for PagerDuty-resolution triggers. Shared with `search-ai-context`; the optional sweep is the interim substitute. Do not build a bespoke subscriber here.
- **Reuse, do not duplicate, the handover collectors.** `oncall-ai-handover-assistant/src/workflow/collectors.ts` and `window.ts` are implemented and solve the same bounded multi-source problem. If both plugins land, extract the shared collector scaffolding rather than maintaining two divergent copies.
- **No new merge, gap, or approval machinery** — `window.ts`, `merge.ts`, `gaps.ts`, and `sweepPlanner.ts` are plugin-local pure modules; approval types, `resume()`, checkpoints, audit, and the scheduler are consumed as-is.

## Frontend Plan

Mirror the `catalog-ai-insights` frontend layout and wiring exactly: `alpha.ts` composing extensions into a `createFrontendPlugin` `FrontendFeature`, `extensions/api.ts` using `ApiBlueprint.make({ params: defineParams => defineParams(createApiFactory({...})) })`, `extensions/components.ts` using `PageBlueprint.make({ name, params: { path, title, routeRef, loader } })` plus `EntityCardBlueprint.make(...)`, self-contained wire types in `@types/`, and an SSE client over `discoveryApi.getBaseUrl('ai-core')` with `eventsource-parser` and `Last-Event-ID` replay. Every directory carries a barrel `index.ts`. The package directory exists but is **empty** — scaffold it from scratch.

```text
plugins/frontend/plugin-ai-agent-frontend-techdocs-ai-postmortem/
  src/
    index.ts                      # barrel: public components/api/types
    alpha.ts                      # createFrontendPlugin: pluginId + extensions
    plugin.ts                     # legacy-system plugin + routable extension
    routes.ts                     # ROOT_PATH + rootRouteRef
    @types/
      index.ts                    # PostmortemRequest/Draft/Publication wire types
    api/
      index.ts                    # barrel
      apiRef.ts                   # techDocsPostmortemApiRef
      client.ts                   # TechDocsPostmortemClient: draftPostmortem(), listIncidents(), streamRunEvents(), submitApproval(), listDrafts()
    hooks/
      index.ts                    # barrel
      usePostmortemRun.ts         # pure reducer + hook (draft/approve/reject/reset)
      useIncidentPicker.ts        # recently resolved incidents without a draft
    components/
      index.ts                    # barrel
      PostmortemPage.tsx          # standalone: incident picker + draft history
      IncidentPickerDialog.tsx    # resolved incidents, window/sources/publish inputs
      GatherRunView.tsx           # live per-source progress from SSE (Log Gatherer)
      TimelineView.tsx            # the ordered Timeline of Events, source-tagged
      UndatedEventsPanel.tsx      # events without usable timestamps, kept separate
      CoveragePanel.tsx           # per-source collected / unavailable / empty / truncated
      GapIndicator.tsx            # silence windows rendered inline in the timeline
      DraftPreview.tsx            # rendered markdown with clickable ev-N citations
      PublicationApprovalBar.tsx  # approve/reject the exact markdown
      PublicationBanner.tsx       # ticket/PR link + incident annotation status
      EntityPostmortemCard.tsx    # entity-page card: recent postmortems for a component
    extensions/
      api.ts                      # ApiBlueprint.make(...)
      components.ts               # PageBlueprint.make(...) + EntityCardBlueprint.make(...)
    __tests__/
```

Frontend deltas vs `catalog-ai-insights`:

- `backstage.pluginId: 'techdocs-ai-postmortem'`; package `@ai-crew-suite/plugin-agent-techdocs-postmortem`.
- Primary surface is a **standalone postmortem page** via `PageBlueprint`, plus an **`EntityCardBlueprint`** card listing a component's recent postmortems — apt since incidents attach to real catalog entities.
- **`CoveragePanel` is a correctness surface, not decoration.** It must distinguish `unavailable` from `empty`: "we could not read Slack" and "nobody spoke" produce very different readings of the same timeline, and conflating them would mislead a review meeting.
- **`DraftPreview` citations must be clickable**, resolving each `ev-N` to its timeline entry and deep link. A postmortem's value in review is that any claim can be checked in one click; an uncited sentence must not render as fact.
- `GapIndicator` renders silence windows inline as *evidence gaps*, never as "nothing happened" — the UI must not imply interpretation the backend deliberately withheld.
- `UndatedEventsPanel` keeps timestamp-less events visibly separate so nothing appears to have a sequence it does not have.
- **Approval UX**: `PublicationApprovalBar` shows the complete rendered markdown (not a summary) plus the `draftHash`, because approving publishes an organizational record. The Root Cause / Action Items placeholders must be visible so the approver sees what remains for humans.
- `incident_open`, `incident_unavailable`, `no_evidence`, and `partial` render as first-class explained outcomes; `draft_only` is a normal terminal state, not a failure.

## Test Strategy

Reuse the `catalog-ai-insights` test-layer table (unit/contract/backend integration/runtime integration/LLM evaluation/full-stack E2E) and its network policies. Deltas only:

- **Unit (the highest-value layer here)**: `window.ts` window derivation from lifecycle timestamps, padding, and `maxWindowHours` clamping. `merge.ts` — the core of the plugin — stable chronological sort, deterministic tie-breaking across equal timestamps, cross-source dedupe within `dedupeWindowSeconds` retaining both citations in `mergedFrom`, `undated` quarantine, and byte-identical output across repeated merges of the same input. `gaps.ts` coverage classification (`collected`/`unavailable`/`empty`/`truncated`) and silence-window detection. `draft.ts` citation validation, including stripping an uncited factual sentence.
- **Workflow (runtime) tests**: drive `PostmortemGraph.run()` with a stubbed `WorkflowContext` (`invokeTool` mock router keyed by `toolId` + args) — the codebase-accurate replacement for the foundation doc's `slack.service` sketch. **Headline scenario (the foundation doc's own fixture)**: incident triggered/resolved timestamps plus two chat messages (`dev-alpha` investigating at `1689363900`, `dev-beta` hotfix at `1689364500`), one alert firing, and one merged PR. Assert all four sources merge into one correctly ordered timeline, every narrative sentence carries a resolving `ev-N`, the run **suspends** at `approval_request`, and **no write tool was called**.
- **Ordering-integrity test**: feed the same events with collectors resolving in different orders and with artificial delays; assert the merged timeline is byte-identical — proving order-independence of collection.
- **Coverage-honesty tests**: with the communication driver absent, assert `chat` is `unavailable` with a reason, the draft is `partial`, the narrative says no data is available for that source, and the document does **not** imply silence. Separately, with the driver present but zero in-window messages, assert `empty` — and that the two states are distinguishable in the artifact.
- **Blamelessness tests**: script the model to emit "the outage was caused by dev-beta's hotfix" and assert `draft.ts` rejects/strips it; assert Root Cause and Action Items remain empty headed placeholders; assert no sentence associates a person with a fault framing.
- **Anti-fabrication tests**: a narrative containing a timestamp, metric value, PR number, or quotation absent from the supplied events is stripped and the draft degrades to timeline-plus-coverage.
- **Transcript-safety tests**: a message containing a credential-shaped string is redacted before it reaches model context/artifact/draft; `detail` respects `maxMessageChars`; a message reading "ignore previous instructions" does not alter output.
- **Incident-state tests**: an incident with no `resolvedAt` terminates `incident_open` with no model call; an unreadable incident terminates `incident_unavailable`.
- **Approval-gate hardening**: no write when the model hallucinates a tool call or attempts to skip the gate; `resume('approved')` publishes exactly once and annotates the incident; `resume('rejected')` publishes nothing; a repeated approved resume is idempotent by `draftHash`; `publish.mode: 'pull_request'` with the tool unregistered fails at boot.
- **Scheduler tests**: `mockServices.scheduler` fast-forwards the sweep tick; assert severity filtering, dedupe against existing drafts, bounded authenticated dispatch, `sweep.enabled: false` respected, and **no autonomous publication**.
- **Backend integration**: `startTestBackend` with this module + AI Core + `mockServices.rootConfig` + `mockServices.database` + `mockServices.urlReader` (the foundation doc's `docs/postmortems` reader fixture), asserting boot registration, per-source SSE step ordering (`node:log-gatherer` start/end as the foundation doc expects), checkpoint at the gate, resume flow, and draft/publication artifact persistence.
- **E2E**: extend the shared fixture profile with a resolved fixture incident, transcript, alert, and PR. Playwright: open the page → pick the incident → watch per-source gathering → review the timeline, coverage, and citations → approve → assert the publication banner; plus a reject path and a missing-transcript partial path. Add `yarn test:e2e:techdocs-ai-postmortem`.

## Security and Operational Guardrails

`catalog-ai-insights` guardrails apply unchanged (identity propagation, redaction before model/SSE/artifacts, tool/token/wall-clock caps, correlation IDs). Postmortem-specific additions — most concern **people data**, since an incident timeline is a record of humans under pressure:

- **No publication without a persisted human approval**, and `publish.mode` defaults to `none`. The decision, `approvedBy`, `draftHash`, and the resulting reference are audit-logged; rejections are audited too. Sweeps reach the gate but cannot satisfy it.
- **Blameless by construction**: no causal claims, no fault attribution to a person, and Root Cause / Action Items left as human placeholders. `draft.ts` enforces this rather than trusting the prompt.
- **Every factual sentence must cite a supplied event.** Uncited prose is stripped; the document degrades to timeline-plus-coverage rather than shipping unverifiable narrative into a permanent record.
- **Transcripts are sensitive**: read only the incident window, redact secret-shaped strings, cap excerpt length, quote exactly or not at all, and treat message text as untrusted prompt input.
- **Never index the draft, transcript, or timeline events** in vector storage. This is the strongest no-index rule in the suite: embedding them would create a durable, searchable record of individuals' incident conduct outside the review process that governs the document.
- **Never present a gap as silence.** `unavailable`, `empty`, and `truncated` stay distinct in state, artifact, and UI, and no source absence is smoothed over in prose.
- Authorization is per-caller: incident, observability, VCS, chat, and catalog reads propagate the requester's credentials, so a postmortem cannot surface a channel or incident the caller could not read. Publication uses the approver's credentials.
- Bounded on every axis — window hours, per-source limits, `maxEvents`, tool caps, wall-clock — so drafting a long incident degrades to `truncated` rather than exhausting a metered chat or monitoring API.

## Ordered Implementation Milestones

### Milestone 0: Pure merge engine and contracts

- [ ] Confirm `incident.incident.get`/`list`/`alert.history`/`annotate`, `observability.metrics.query`/`logs.search`, `vcs.pull_request.list`, `communication.channel.lookup`/`history`, `project.ticket.create`, and `CatalogEntityResolver` against the installed code.
- [ ] Define `TimelineEvent`, `SourceCoverage`, `TimelineGap`, `PostmortemRequest`, `PostmortemDraft`, `PostmortemPublication`, and the config schema.
- [ ] Implement + unit-test `request.ts`, `window.ts`, `merge.ts` (sort, dedupe, tie-breaks, undated quarantine), `gaps.ts`, and the citation validator in `draft.ts`.

Exit criteria: chronological ordering, cross-source dedupe, and coverage classification are provably deterministic and order-independent on fixtures.

### Milestone 1: Gather-and-draft backend (read-only)

- [ ] Scaffold the package with a barrel `index.ts` in every directory, register the runner/agent/manual trigger, config parsing; register in root `tsconfig.json` + `.eslintrc.cjs`.
- [ ] Implement resolve → window → gather → merge → gaps → narrate → `postmortem-draft`, with `IncidentResolver`, `TranscriptReader`, `DocsTargetResolver`, and `PostmortemToolRunner` — following the implemented `oncall-ai-handover-assistant` collector pattern.
- [ ] Wire into `packages/backend` and add the `ai.agents.techDocsPostmortem` config block.
- [ ] Add unit, workflow-scenario, ordering-integrity, coverage-honesty, blamelessness, and backend integration tests.

Exit criteria: the foundation doc's four-source fixture yields one correctly ordered, fully cited timeline with no real LLM and no writes.

### Milestone 2: Approval-gated publication

- [ ] Implement the gate + `PostmortemGraph.resume()`: checkpointed markdown + `draftHash`, `approval_request`, `publish.mode: 'ticket'` via `project.ticket.create`, optional `incident.incident.annotate` cross-link, `postmortem-publication` artifact, audit, and `draftHash` idempotency.
- [ ] Gate-hardening, publication-mode, and annotate-failure (`partially_published`) tests.

Exit criteria: a postmortem is published only after approval, exactly once, with the incident cross-linked and partial outcomes reported precisely.

### Milestone 3: PR publication (when the write tool lands)

- [ ] Add `vcs.pull_request.create` to the allow-list and implement `publish.mode: 'pull_request'` writing the markdown under `template.docsPath`, with boot-time validation that the tool is registered.
- [ ] PR-path tests mirroring the ticket path, plus the fail-at-boot assertion for a misconfigured mode.

Exit criteria: an approved draft opens exactly one documentation PR, and a missing tool fails startup rather than degrading silently.

### Milestone 4: Sweep, frontend, and E2E

- [ ] Implement `resolvedSweep` with severity floor, existing-draft dedupe, mutex, caps, and kill switch, plus fast-forwarded scheduler tests asserting no autonomous publication.
- [ ] Scaffold the empty frontend package (`ApiBlueprint` + `PageBlueprint` + `EntityCardBlueprint`, incident picker, gather run view, timeline, undated panel, coverage panel, gap indicators, draft preview with clickable citations, approval bar, publication banner) with barrel indexes, and register it in `packages/app`.
- [ ] Component tests (loading, per-source streaming, incident_open/incident_unavailable/no_evidence/partial, draft_only, awaiting approval, published, partially_published, replay) plus accessibility checks — including assertions that `unavailable` is visually distinct from `empty` and that every rendered fact carries a resolvable citation.
- [ ] Extend the E2E fixture profile and add Playwright draft, approve, reject, and missing-transcript scenarios with screenshot review.

Exit criteria: `yarn test:e2e:techdocs-ai-postmortem` demonstrates incident → gathered timeline → cited draft → approve → publication, plus reject and partial paths, without external infrastructure.

### Milestone 5: Production readiness

- [ ] Document model registration, driver configuration per evidence source, window/padding tuning, template authoring, publication-mode selection, sweep enablement, approver permissions, and — prominently — the **blameless and no-index policies**.
- [ ] Dashboards/alerts for drafts per period, **source coverage rate** (the key trust metric), citation-strip rate (model-quality signal), `no_evidence` rate, approval/rejection ratio, and token cost per draft.
- [ ] Opt-in real-model evaluation suite (grounding: every sentence cites a supplied `ev-N`; no invented timestamps, metrics, PRs, or quotations; no causal or blame language; placeholders left intact) within budget.
- [ ] Follow-ups: `vcs.pull_request.create` (**five plugins now waiting**), windowed `listPullRequests`, and the events contract.

Exit criteria: staged rollout with `publish.mode: 'none'` and the sweep disabled by default, verified citation grounding, and the blameless policy documented for incident reviewers.

## Frontend Completed

### Standalone postmortem timeline UI

- Route: `/techdocs-ai-postmortem`

- Agent: `techdocs-ai-postmortem`

- Artifact: `postmortem-draft`

- Supports authenticated AI Core SSE for:

  - Starting a draft from one resolved incident ID.
  - Replaying persisted drafts via `?run=<id>`.

### UI behavior

- Incident ID dialog for initiating one draft.

- Draft page rendering:

  - Ordered, cited incident and alert timeline events.
  - Timeline source/reference links.
  - Lifecycle analysis window.
  - Per-source coverage states.
  - Narrative with event citations.
  - Explicit limitations and missing evidence classes.

- Clear blameless/draft-only wording.

### Honesty boundaries

The UI deliberately does not expose:

- Root-cause or blame controls.
- Approval or publication controls.
- Ticket creation.
- Incident annotation.
- Documentation PR delivery.
- Chat, observability, deployment, or PR evidence collection controls.

Those unavailable capabilities remain visible only as source coverage gaps and backend limitations.

## Registration

Wired into:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/app/src/App.test.tsx`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

## Tests

Added:

- Postmortem artifact reducer extraction and malformed JSON handling.
- Timeline event, coverage, limitation, and source-reference rendering.
- App feature-list coverage for `techdocs-ai-postmortem`.

## Backend Completed

### AI Core module

- Agent ID: `techdocs-ai-postmortem`

- Workflow ID: `techdocs-postmortem`

- Artifact kind: `postmortem-draft`

- Read-only tool allow-list:

  - `incident.incident.get`
  - `incident.alert.history`

### Deterministic timeline draft

- Validates a versioned request for one incident ID.

- Fetches incident detail, lifecycle timestamps, and responder-note timestamps.

- Requires the incident to be resolved:

  - Emits `incident_open` without timeline drafting for unresolved incidents.
  - Emits `incident_unavailable` if incident retrieval fails.

- Derives a bounded incident lifecycle window using configured padding.

- Collects alert-history evidence within that window.

- Produces a stable chronological merge with deterministic source/ID tie-breaking.

- Emits one cited timeline event ID per incident, note, alert, and resolution event.

- Produces an evidence-only narrative composed from the ordered timeline.

### Explicit coverage and limitations

Every draft records the unavailable/deferred sources instead of implying they were silent:

- Chat transcript.
- Observability metrics and logs.
- Deployment/PR activity.
- Causal/root-cause analysis.
- Publication, incident annotation, tickets, and documentation PRs.

The agent does not attribute fault, infer causes, publish Markdown, or invoke any write tool.

## Tests

Added focused coverage for:

- Stable chronological merge with deterministic tie-breaking.
- Resolved incident timeline construction.
- Incident notes and alert firings included in order.
- Confirmation that the workflow invokes only incident detail and alert-history reads.

## Registration

Wired into:

- `/home/kevin/Repos/backstage/ai-crew-suite/tsconfig.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/.eslintrc.cjs`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/package.json`
- `/home/kevin/Repos/backstage/ai-crew-suite/packages/backend/src/index.ts`
- `/home/kevin/Repos/backstage/ai-crew-suite/app-config.yaml`
- `/home/kevin/Repos/backstage/ai-crew-suite/yarn.lock`

Configuration added:

```yaml
ai:
  agents:
    techdocsPostmortem:
      model: techdocs-postmortem
```

## Definition of Done

- Package, agent, runner (`run` + `resume`), triggers (manual + sweep), config schema, and the allow-list implemented and registered (root + backend/app wiring included), with a barrel `index.ts` in every directory.
- Runs execute through the real AI Core controller/runtime with persisted replayable events, per-source `step` attribution (`node:log-gatherer` boundaries), a checkpoint at the gate, and `postmortem-draft` / `postmortem-publication` artifacts.
- The timeline is produced by pure deterministic code over already-timestamped sources: ordering, dedupe (retaining citations), undated quarantine, and tie-breaking are order-independent and reproducible.
- Coverage and gaps are computed and rendered inside the document; `unavailable`, `empty`, and `truncated` are never conflated, and no source absence is presented as silence.
- Every factual sentence in the narrative cites a supplied `ev-N`; uncited prose is stripped rather than published, and no timestamp, metric, PR, or quotation is ever invented.
- The draft is blameless by construction: no causal claims, no fault attribution to a person, and Root Cause / Action Items left as human placeholders.
- Transcript reads are window-bounded, redacted, length-capped, and quoted exactly; neither the transcript nor the draft is ever written to vector storage.
- No publication occurs without a persisted approval; publication is idempotent by `draftHash`, uses the approver's credentials, optionally cross-links the incident, and reports partial outcomes precisely.
- Frontend renders per-source gathering, the ordered timeline, coverage, gaps, and clickable citations over live SSE and replay via `ApiBlueprint`/`PageBlueprint`; Playwright verifies draft, approve, reject, and partial paths on fixtures.
- No output surface (SSE, artifacts, logs, audit, tests, tickets, published markdown) contains secrets, unbounded transcript text, uncited claims, fabricated timestamps, or blame attribution.
