# Session Notes

## Prompts

I have a turbo monorepo of agentic workflow plugins for Spotify's backstage. It has a group of 18 agentic workflow plugins named in the pattern plugin-ai-agent-backend-*. Tests are in a __tests__ folder in the directory of code files.

We also have a plugins/backend/plugin-ai-core-backend and its associated plugins/backend/plugin-ai-core-node plugin. There are also plugins following a plugins/backend/plugin-ai-core-backend-module-* naming scheme that provide access to third-party platforms through a uniform interface, and to external storage and llm providers.

I'm working through improving the code quality of plugins. Implementation code should be enterprise-quality and highly robust. Unit test coverage should be robust.

Backend Controller Prompt

I'd like to work through the controller code we've refactored recently and evaluate our work product block by block. I'd like to evaluate each code block on these criteria:

1. Does this code conform to Spotify Backstage conventions?
2. This code will potentially be deployed in highly regulated enterprise environments. Does this code meet strict requirements for quality and best practices?
3. Is the code well organized? Is it overly complex? What improvements would you suggest making to it?
4. Is error handling robust and appropriate in this code?
5. Are there are any issues with logging, like not logging information we should be logging? Are we using the Backstage platform logger methods?
6. Let's improve tsdoc blocks or add them if they're missing.

Then, let's generate a comprehensive unit test suite for this code block. As we go along the code blocks in a controller file, I'll paste the test suites into our test file and run them.

We have strict rules against casting to any or using any types in production code. In general, any type cast is heavily scrutinized and needs to be avoided. We prefer using generics or correctly fixing types - this is a greenfield refactor and we want to do it correctly.

## Follow-Up Prompt

Let's analyze our code and update it to be suitable for highly regulated enterprise environments. What hardening are we missing? Let's add it.

Anything we're missing in the implementation code?

Let's analyze our test cases and make sure we're implementing a thorough and enterprise-ready test suite. What edge cases are we missing?

Any other test cases that should be in our suite?

## Implementing Accounting

Analysis of Current State: `plugins/kernel/node/src/types/telemetry.ts`

If `UsageMetadata` is completely unreferenced right now, its presence in your core types folder is technically a premature abstraction. However, because this is an AI orchestration platform, token accounting is foundational to achieving operational compliance.

Regulated Enterprise Context (FINRA / SOC-2 Audit Logging)

You cannot pass a strict security audit for an enterprise generative AI system if you do not track token usage metrics. Token metrics are necessary for:

- **Cost Allocation & Cost Centers:** Tracking down which departments or automated loops are spinning up enormous inference bills.
- **Data Leakage & Exfiltration Controls:** Detecting anomalies (e.g., an automated agent suddenly requesting or generating millions of unexpected tokens on a routine sweep, which often signals a data exfiltration loop or an infinite agent cycle).

## Backend Production Code Issues

### LLM and Vector Store as Stand-Alone Groups

These two plugin groups are not set up as backstage plugins, and so there is no `engine` plugin for them. I think the reason is because the vector stores are using langgraph as a direct import - and the LLM are all dependent on importing `pgvector`.

### Runtime Store is Conflating Multiple Store

`runtime-store` is handling Redis and SQL-backed stores, so pulling in unnecessary dependencies. It should be refactored to the `engine` pattern as a backstage plugin group also.

## Investigate `@ai-crew-suite/plugin-retrieval-augmenter-backend`

Why is the retrieval augment importing `@langchain/core`?

## Frontend Production Code Issues

### Finish refactor of React

We started refactoring `plugins/kernel/react` to be a common class for frontend plugins but broke off for the renaming refactor mid-way as it became clear that was necessary to avoid extra work.

### Untyped Integration Payloads (`toSuppressionWindows`)

In `correlate.ts`, `toSuppressionWindows` consumes raw output rows with a loose structural check:

```typescript
const rows = Array.isArray(records) ? records : [];
```

The method then manually loops through strings like `triggeredAt`, `startedAt`, `observedAt`, and `timestamp` to guess which field contains the timestamp.

- **The Problem:** This design bypasses type checking at your network boundaries. It assumes that downstream utility tools (Slack modules, GitHub integrations, pager modules) map their outputs to one of those four hardcoded string names.
- **The Risk:** If a downstream module upgrades its dependency framework and renames its output payload layout fields (e.g., from `startedAt` to `createdAt` or `time`), the loop will silently ignore the entire row dataset. It returns an empty list instead of failing explicitly, which blinds your automated tuning graphs to real ongoing production incident signals.
- **The Fix:** Instead of passing an unverified array down-funnel, use strict Zod validation schemas right at the output boundary of your tool modules (the Slack and GitHub wrappers) to normalize payloads into a standard type before they reach the workflow layer.

### Direct, Unguarded Network Calls in Schedulers

In `weeklySweep.ts`, the background task fires native `fetch` requests inside a loop directly to the engine's REST paths:

```typescript
const response = await fetch(`${base}/agents/${ALERT_AI_TUNER_AGENT_ID}/runs`, { ... });
```

- **The Problem:** This completely bypasses the Backstage plugin communication layers, requiring manual management of headers, authorization tokens, content types, and error states.
- **The Risk:** If the core engine URL shifts slightly due to sub-route base mapping flags, or if the payload wrapper structures mutate during a framework upgrade, the scheduler will fail silently, logging basic warnings rather than leveraging a centralized API bridge client interface.
- **The Fix:** Abstract this communication layer. The scheduler should use the centralized **`AiAgentClientFactory`** we designed to trigger runs typesafely over an explicit interface hook rather than manually executing raw `fetch` string concatenations.

### Silent Degradation via `try/catch` Swallowing

In `TunerToolRunner.ts`, the `invoke` method wraps its execution block in a generic catch-all trap:

```typescript
} catch (error) {
  // ... logs warning and returns undefined
  return undefined;
}
```

- **The Problem:** While fault isolation is good, treating *all* errors identically obscures critical runtime infrastructure problems.
- **The Risk:** If a network call fails due to a temporary network blip, returning `undefined` is appropriate. However, if it fails due to a **database connection failure**, an **expired authorization token**, or an **out-of-memory fatal crash**, swallowing the exception and returning `undefined` misleads the orchestration engine into thinking the tool completed with "empty data," rather than failing due to platform issues.
- **The Fix:** Differentiate your errors. Catch and handle transient operational errors safely, but explicitly re-throw system-level anomalies (such as authentication failures or memory exhaustion tokens) to allow the orchestration runtime to halt the execution immediately.



