# Real-time Dashboard Updates via WebSocket

**Issue:** [#25](https://github.com/ddteeter/agent-shepherd/issues/25)
**Date:** 2026-03-15

## Problem

The project overview page (dashboard) fetches project data once on mount and never updates. Users must manually refresh to see PR count changes (e.g., new PR submitted, review approved).

## Solution

Use the existing `useWebSocket` hook in `dashboard.tsx` to subscribe to relevant events and refetch the project list — the same pattern used by `project-view.tsx` and `pr-review.tsx`.

## Changes

### Frontend (`dashboard.tsx`)

Subscribe to these WebSocket events and refetch `api.projects.list()` on each:

- `pr:created` — pending review count changes
- `pr:updated` — PR closed/reopened affects counts
- `review:submitted` — approval/request-changes changes cycle status
- `agent:completed` — new review cycle created
- `agent:error` — cycle status changes
- `project:created` — new project appears on dashboard

### Backend (`routes/projects.ts`)

Emit `project:created` broadcast after inserting a new project in `POST /api/projects`. All other relevant events are already broadcast.

### Shared Types

Add `project:created` to WebSocket event types if formally defined.

### Testing

- Backend: verify `project:created` broadcast on project creation
- Frontend: verify `useWebSocket` integration triggers refetch on relevant events
