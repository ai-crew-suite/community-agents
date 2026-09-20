# Search AI Context (Frontend)

Backstage UI for the read-only `search-ai-context` agent.

- Starts one scoped source-change assessment.
- Streams and replays AI Core events using `?run=<run-id>`.
- Displays consumer classifications, textual code-reference evidence, owner rollups, and limitations.

`unknown` explicitly means the consumer could not be verified; it is intentionally
shown differently from `unaffected`. A code match is a textual reference and does
not prove runtime breakage.

The current backend does not provide a validation cursor or a resume endpoint, so
the UI deliberately does not render a non-functional continue action.
