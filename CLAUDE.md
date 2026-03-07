# Agent Shepherd

## Project Overview

Human-in-the-loop PR review app for AI coding agents. Monorepo with four npm workspace packages: `backend`, `frontend`, `cli`, `shared`.

## Architecture

- **Backend** (`packages/backend`): Fastify server, SQLite/Drizzle ORM, WebSocket, agent orchestrator
- **Frontend** (`packages/frontend`): React 19 + Vite + Tailwind CSS 4, Shiki syntax highlighting
- **CLI** (`packages/cli`): Commander.js CLI (`agent-shepherd`) used by agents and humans
- **Shared** (`packages/shared`): TypeScript types consumed by all other packages

## Key Paths

| Purpose | Path |
|---|---|
| DB schema (Drizzle) | `packages/backend/src/db/schema.ts` |
| API routes | `packages/backend/src/routes/*.ts` |
| Agent orchestrator | `packages/backend/src/orchestrator/` |
| Prompt builder | `packages/backend/src/orchestrator/prompt-builder.ts` |
| Claude Code adapter | `packages/backend/src/orchestrator/claude-code-adapter.ts` |
| Git service | `packages/backend/src/services/git.ts` |
| Shared types | `packages/shared/src/types.ts` |
| React pages | `packages/frontend/src/pages/` |
| React components | `packages/frontend/src/components/` |
| API client | `packages/frontend/src/api.ts` |
| CLI commands | `packages/cli/src/commands/` |
| Design docs | `docs/plans/` |

## Commands

```bash
npm run dev                                  # Start backend + frontend
npm run dev --workspace=packages/backend     # Backend only (port 3000)
npm run dev --workspace=packages/frontend    # Frontend only (port 5173)
npm run build                                # Build all packages
npm run test                                 # Run tests (Vitest)
```

## Database

SQLite via better-sqlite3 + Drizzle ORM. Tables: `projects`, `pull_requests`, `review_cycles`, `comments`, `diff_snapshots`, `global_config`, `project_config`. Schema defined in `packages/backend/src/db/schema.ts`.

When generating migrations, always use `--name` to give them a logical name:
```bash
npx drizzle-kit generate --name <descriptive_name>
# Example: npx drizzle-kit generate --name add_user_preferences
```

## Review Flow

1. Agent submits PR via `agent-shepherd submit` (creates PR + first ReviewCycle + DiffSnapshot)
2. Human reviews in web UI, adds inline comments with severity (`must-fix` / `request` / `suggestion`)
3. Human submits review: "Approve" or "Request Changes"
4. On request changes: orchestrator builds prompt from comments, spawns new agent session
5. Agent makes changes, replies via `agent-shepherd batch`, calls `agent-shepherd ready`
6. New ReviewCycle + DiffSnapshot created, human re-reviews

## API Structure

REST under `/api/`. Key routes:
- Projects: CRUD at `/api/projects`
- PRs: `/api/projects/:projectId/prs` and `/api/prs/:id`
- Reviews: `POST /api/prs/:id/review` (approve/request-changes)
- Comments: `/api/prs/:prId/comments` with batch support
- Diffs: `GET /api/prs/:id/diff?cycle=N`

WebSocket broadcasts real-time events: `pr:*`, `comment:*`, `review:submitted`, `agent:*`

## Conventions

- TypeScript strict mode everywhere
- ESM modules (`"type": "module"`)
- Drizzle ORM for all database operations (no raw SQL)
- UUIDs for all primary keys
- Shared types in `@agent-shepherd/shared` -- import from there, not from backend/frontend
- Frontend uses CSS custom properties for theming + Tailwind utility classes
- Shiki for syntax highlighting in diff viewer (not highlight.js)
- Backend validates request bodies with Fastify schemas
- Never introduce TODO comments in code -- either implement immediately or document in `docs/plans/`
- When a skill exists for an agent task, prompts should reference the skill by name rather than duplicating its content. Do not repeat skill instructions in prompt builders -- the skill is the single source of truth. If something needs to change about agent behavior, change the skill, not the prompt.

## Agent Orchestrator

The orchestrator (`packages/backend/src/orchestrator/`) manages the AI agent lifecycle:
- `prompt-builder.ts` constructs structured prompts from review comments (grouped by file, includes severity and threading)
- `claude-code-adapter.ts` spawns Claude Code CLI as subprocess (always starts a new session)
- `AgentAdapter` interface allows future adapters (Cursor, Aider, etc.)

## Current Status

Active development on `feat/initial-implementation` branch. Core functionality is working. Recent work includes syntax highlighting, diff viewer performance, multi-line comment support, and file tree improvements.
