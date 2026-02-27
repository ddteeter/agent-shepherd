---
name: agent-shepherd:context-guidelines
description: Use when preparing a context file for agent-shepherd submit. Guides structured context creation for PR submissions including architectural decisions, trade-offs, and notes for future sessions.
---

# Skill: PR Context Guidelines for Agent Shepherd

## When to Use

Use this skill whenever you are preparing a context file for `agent-shepherd submit --context-file`. The context you attach to a PR serves two purposes:

1. **For the human reviewer:** It explains your thinking, making the review faster and more productive.
2. **For future agent sessions:** If the review requires changes and the orchestrator starts a new session (instead of resuming), this context is injected into the prompt so the new session understands what was built and why.

Good context dramatically improves review quality and reduces wasted cycles.

## Context File Structure

The context file is a JSON object. Include all of the following sections:

```json
{
  "summary": "...",
  "architecturalDecisions": ["..."],
  "tradeOffs": ["..."],
  "planReference": "...",
  "knownLimitations": ["..."],
  "notesForFutureSessions": ["..."]
}
```

## Section-by-Section Guidance

### `summary`

A concise description of what was built and why. This is the first thing the reviewer reads, so make it count.

**Good:**
```json
"summary": "Implemented the WebSocket server for real-time PR status updates. The server pushes events (pr:created, comment:added, review:submitted, agent:working) to connected frontend clients. Uses @fastify/websocket with per-PR topic subscriptions so clients only receive events for PRs they are viewing."
```

**Bad:**
```json
"summary": "Added WebSocket support."
```

Guidelines:
- State WHAT you built (the feature/component)
- State WHY (what problem it solves or what spec it fulfills)
- State HOW at a high level (the approach, key libraries, patterns used)
- 2-4 sentences is the right length

### `architecturalDecisions`

List the significant design choices you made. Focus on decisions where alternatives existed and you chose a specific path.

**Good:**
```json
"architecturalDecisions": [
  "Used per-PR topic subscriptions rather than broadcasting all events to all clients. This reduces bandwidth and avoids leaking information between PR views.",
  "Stored WebSocket connections in a Map keyed by connection ID with a Set of subscribed PR IDs. This allows O(1) lookup when a client subscribes/unsubscribes.",
  "Chose to send full event payloads rather than just event names. Clients can update their UI without making a follow-up REST call."
]
```

**Bad:**
```json
"architecturalDecisions": [
  "Used WebSockets.",
  "Used a Map for connections."
]
```

Guidelines:
- Each entry should state the decision AND the reasoning
- Focus on decisions where you chose between alternatives
- Include decisions about data structures, patterns, library choices, and API design
- Skip trivial decisions (e.g., "used const instead of let")

### `tradeOffs`

Explicitly call out trade-offs you accepted. Every non-trivial system has them. Being upfront about trade-offs builds trust with the reviewer and prevents "did you consider X?" comments.

**Good:**
```json
"tradeOffs": [
  "WebSocket connections are not authenticated. Since this is a local-only application, this is acceptable. If the app ever becomes network-accessible, authentication middleware must be added to the WebSocket upgrade handler.",
  "Event payloads include the full object (e.g., full PR data on pr:updated). This simplifies the client but increases message size. For a local app with few concurrent users, the bandwidth cost is negligible.",
  "No message queuing or persistence. If a client is disconnected when an event fires, they miss it and must refresh. Acceptable for this use case since the REST API is the source of truth."
]
```

Guidelines:
- State the trade-off clearly: what you gained and what you gave up
- Explain why the trade-off is acceptable in this context
- Mention under what conditions the trade-off would need to be revisited

### `planReference`

A path or identifier pointing to the plan or spec you were implementing.

```json
"planReference": "docs/plans/2026-02-24-agent-shepherd-implementation.md, Task 19: WebSocket Server"
```

Guidelines:
- Use a file path if the plan is in the repo
- Include the specific task/section if the plan covers multiple features
- If there is no formal plan, reference the issue, ticket, or conversation that defined the work

### `knownLimitations`

Things that are not implemented, edge cases that are not handled, or constraints the reviewer should be aware of.

**Good:**
```json
"knownLimitations": [
  "No reconnection logic on the client side yet. If the WebSocket drops, the client must manually refresh.",
  "The server does not limit the number of concurrent WebSocket connections. This is fine for local use but could be a problem if exposed on a network.",
  "Event ordering is not guaranteed if multiple backend processes emit events simultaneously. Currently there is only one backend process, so this is not an issue."
]
```

Guidelines:
- Be honest. Hiding limitations wastes review cycles when the reviewer discovers them
- Distinguish between "not yet implemented" (planned for later) and "will not implement" (out of scope)
- If a limitation has a workaround, mention it

### `notesForFutureSessions`

Information that a future agent session would need if it has to pick up this work without the benefit of your current context window.

**Good:**
```json
"notesForFutureSessions": [
  "The WebSocket server is initialized in packages/backend/src/websocket.ts and registered as a Fastify plugin in server.ts.",
  "Event emission happens through the WebSocketService singleton. Any route or service can import it and call `broadcast(prId, event)`.",
  "The client-side hook is in packages/frontend/src/hooks/useWebSocket.ts. It manages connection lifecycle and exposes an `events` observable.",
  "Tests are in packages/backend/src/__tests__/websocket.test.ts. They use a real WebSocket connection to localhost.",
  "If adding new event types, update the WebSocketEvent union type in packages/shared/src/types.ts."
]
```

Guidelines:
- Point to the key files and their roles
- Explain the main abstractions and how to extend them
- Mention where tests live and how to run them
- Include anything that was non-obvious or surprising during implementation
- Think of this as writing a handoff document for a colleague who has never seen the code

## Complete Example

```json
{
  "summary": "Implemented the comments API with full CRUD operations, threading support, and batch submission. Comments are scoped to review cycles and support three severity levels (must-fix, request, suggestion). The batch endpoint accepts multiple comments and replies in a single request, which is the primary interface for agent responses to reviews.",
  "architecturalDecisions": [
    "Comments use a self-referencing parentCommentId for threading rather than a separate threads table. Simpler schema, and thread depth is shallow (typically 1-2 replies).",
    "The batch endpoint validates all items before creating any. If one item fails validation, the entire batch is rejected. This prevents partial state where some replies are posted but others are not.",
    "Severity is stored as a string enum rather than an integer. More readable in the database and in API responses, marginal storage cost."
  ],
  "tradeOffs": [
    "No pagination on the comments list endpoint. PRs in this system typically have tens of comments, not thousands. If comment volume becomes an issue, pagination can be added without breaking the API contract by adding optional query parameters.",
    "Batch endpoint does not support partial success. This means a single invalid commentId in a reply will reject the entire batch. Chosen for data consistency over convenience."
  ],
  "planReference": "docs/plans/2026-02-24-agent-shepherd-implementation.md, Task 8: Comments API",
  "knownLimitations": [
    "No rate limiting on comment creation. Not needed for local use.",
    "Comment body is not validated for length or content. Extremely long comments could cause rendering issues in the frontend.",
    "Deleting a parent comment does not cascade-delete replies. Orphaned replies will still appear in the API response."
  ],
  "notesForFutureSessions": [
    "Comment routes are in packages/backend/src/routes/comments.ts, registered in server.ts.",
    "The batch endpoint is at POST /api/prs/:id/comments/batch. It accepts the BatchCommentPayload type from @agent-shepherd/shared.",
    "Threading is handled by parentCommentId. To get a threaded view, query all comments for a review cycle and group client-side by parentCommentId.",
    "Tests are in packages/backend/src/__tests__/comments.test.ts. They cover CRUD, threading, batch operations, and validation edge cases.",
    "The CommentSeverity type is defined in packages/shared/src/types.ts. If adding new severity levels, update both the type and the database schema check constraint."
  ]
}
```

## Common Mistakes to Avoid

1. **Being too brief.** "Added the API" is not useful context. The reviewer and future sessions need to understand your thinking, not just what files changed.
2. **Being too verbose.** Do not paste entire code blocks into the context. Summarize and reference file paths instead.
3. **Omitting trade-offs.** Every implementation involves trade-offs. If you cannot think of any, you have not thought hard enough. Explicitly listing them shows the reviewer you considered alternatives.
4. **Forgetting notes for future sessions.** This section is critical for multi-cycle reviews. Without it, a new session starts from scratch and may make different (possibly conflicting) design choices.
5. **Stale plan references.** Make sure the plan reference actually points to something that exists and is relevant. A broken link is worse than no link.
6. **Not mentioning test locations.** Future sessions need to know where tests are and how to run them, especially if they need to update tests after making review-requested changes.
