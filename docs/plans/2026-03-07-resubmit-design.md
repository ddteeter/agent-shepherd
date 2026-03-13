# Resubmit: Outside-of-Flow Changes

## Problem

When a human makes changes directly (e.g., working in Claude Code outside the review UI flow), there's no way to capture those changes as a new review cycle. The existing `agent-shepherd ready` command is designed for agents completing review feedback — it doesn't accept context about what changed, and it assumes the previous cycle was fully reviewed with `changes_requested`.

## Solution

A new `agent-shepherd resubmit` CLI command and a `superseded` cycle status that cleanly handles cycles that were never fully reviewed or where the human took over.

## Design

### New CLI Command: `resubmit`

```bash
agent-shepherd resubmit <prId> --context-file <path>
```

- `--context-file` is required — provides a JSON or text file describing what changed and why
- Works on any existing PR regardless of the current cycle's status
- The human does not create the context file manually — the agent generates it as part of the resubmit skill (analyzing the diff and commits since the last cycle)

### New Cycle Status: `superseded`

Added to the existing cycle status values (`pending_review`, `changes_requested`, `agent_working`, `approved`).

A `superseded` cycle means "this cycle was replaced before being fully reviewed or completed." It preserves history without implying the cycle was reviewed or that an agent addressed it.

### What Happens on Resubmit

1. The current (latest) cycle is marked `superseded`
2. A new cycle is created with:
   - `status: 'pending_review'`
   - Fresh diff snapshot (base branch vs source branch)
   - Current commit SHA
3. The context from `--context-file` is stored (mechanism TBD — could be on the cycle record or as a special comment)
4. WebSocket broadcasts `pr:ready-for-review`
5. OS notification fires

### Backend: New API Endpoint

```
POST /api/prs/:id/resubmit
Body: { context: string }
```

Performs the same cycle creation as `agent-ready` but:

- Sets previous cycle status to `superseded` instead of marking `agentCompletedAt`
- Stores the provided context
- Does not require the previous cycle to be in `changes_requested` or `agent_working` status

### Comments

No changes needed. Comments already display across all cycles for a PR (the GET `/api/prs/:prId/comments` endpoint returns comments from all cycles). Unresolved comments from superseded cycles remain visible and actionable in the UI.

### Diff Snapshots

Cycle snapshots work as-is — each snapshot is always the full base→source diff. A superseded cycle retains its snapshot for historical reference.

**Inter-cycle diffs:** The frontend cycle selector should be aware of superseded cycles:

- Default the inter-cycle comparison to "since last reviewed cycle" (skipping superseded ones) rather than "since previous cycle"
- Both options remain available in the dropdown
- Superseded cycles are visually distinct (e.g., grayed out, labeled) in the cycle selector

### Frontend Changes

- Handle `superseded` status in cycle list display (gray out or collapse)
- Update inter-cycle diff dropdown to default to last reviewed cycle
- Show resubmit context in the cycle header or as a system comment

### Skill

Create a new `agent-shepherd:resubmit-pr` skill (or extend `agent-shepherd:submit-pr`) that teaches agents to:

1. Determine the PR ID (from `agent-shepherd status` or user input)
2. Analyze what changed since the last cycle — diff the current state against the last cycle's commit SHA, review recent commits
3. Generate a context file summarizing what changed and why (similar to the context file in the submit skill, but focused on the delta)
4. Run `agent-shepherd resubmit <prId> --context-file <generated-file>`

The human's role is just to say "resubmit this" — the agent handles context generation.

### README

Add an "Outside of Agent Shepherd Changes" section documenting the workflow:

1. Make changes directly on the branch
2. Tell the agent to resubmit (the agent generates context and runs the command)
3. Review the new cycle in the UI

## Data Model Changes

### `review_cycles` table

- Add `superseded` to the set of valid `status` values (enforced by application logic, not a DB constraint)

### Context storage (TBD)

Options:

1. Add a `context` text column to `review_cycles` — simple, keeps context with the cycle
2. Store as a system-authored comment on the new cycle — visible in the comment thread
3. Update `agentContext` on the `pull_requests` table — reuses existing field but overwrites previous context

Option 1 is recommended for simplicity.

## Non-Goals

- Automatic line-number remapping for comments (comments display as-is; humans adjust if needed)
- Cloning/copying comments between cycles (unnecessary — comments already show across all cycles)
- Changes to the orchestrator or agent prompt builder (resubmit is a human-initiated action)
