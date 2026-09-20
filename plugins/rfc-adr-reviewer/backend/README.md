# RFC / ADR AI Reviewer (Backend)

This AI Core module performs a bounded, parallel, advisory review of one
RFC/ADR document. A Senior Architect channel evaluates architecture context;
a Security Lead channel evaluates policy/compliance context; a deterministic
compiler merges their cited findings into a `design-critique` artifact.

The current installation lacks both the shared catalog resolver and the
`vcs.pull_request.comment` write tool. This module therefore remains
**read-only and draft-only**. It does not subscribe to events, emit approvals,
or post PR comments until those shared contracts are implemented.
