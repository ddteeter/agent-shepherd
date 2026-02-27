# Agent Shepherd

A local human-in-the-loop PR review application for AI coding agents. Agent Shepherd bridges autonomous code generation and human oversight by enabling a structured review cycle -- an AI agent implements code, a human reviews it with inline comments, and they iterate until approval.

## How It Works

```
                    +-----------------+
                    |   Human plans   |
                    |   a feature     |
                    +--------+--------+
                             |
                             v
                    +--------+--------+
                    |  Agent executes  |
                    |  implementation  |
                    +--------+--------+
                             |
                  agent-shepherd submit --title "Add auth"
                             |
                             v
              +--------------+--------------+
              |        Web UI (React)       |
              |  Human reviews code diffs,  |
              |  adds inline comments with  |
              |  severity levels            |
              +--------------+--------------+
                             |
                     +-------+-------+
                     |               |
                  Approve      Request Changes
                     |               |
                     v               v
                   Done     +--------+--------+
                            |   Orchestrator   |
                            | builds prompt    |
                            | from comments,   |
                            | spawns agent     |
                            +--------+--------+
                                     |
                            claude --resume <id>
                                     |
                                     v
                            +--------+--------+
                            |  Agent makes     |
                            |  changes, replies |
                            |  to comments      |
                            +--------+--------+
                                     |
                          agent-shepherd ready <prId>
                                     |
                                     v
                            (cycle back to review)
```

## Architecture

Monorepo with four packages sharing types via `@agent-shepherd/shared`:

```
agent-shepherd/
├── packages/
│   ├── backend/     Fastify server, SQLite/Drizzle, agent orchestrator
│   ├── frontend/    React UI with syntax-highlighted diff viewer
│   ├── cli/         `agent-shepherd` CLI for agents and humans
│   └── shared/      TypeScript types shared across packages
├── skills/          Claude Code skills for agent workflows
└── docs/plans/      Design and implementation documents
```

### Component Interaction

```
Human  <-->  Web UI  <-->  Backend API  <-->  SQLite
                              |
Agent  <-->  CLI     <-->  Backend API
                              |
                     Agent Orchestrator  -->  Claude Code CLI
```

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20+ / TypeScript |
| Backend | Fastify + WebSocket |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Syntax highlighting | Shiki |
| CLI | Commander.js |
| Git operations | simple-git |
| Monorepo | npm workspaces |

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm
- Git
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude` on PATH)

### Install (global)

```bash
npm install -g agent-shepherd
agent-shepherd setup    # Installs skills, verifies claude is on PATH
agent-shepherd start    # Server + UI on http://localhost:3847
```

### Register a Project

```bash
# From a git repository
agent-shepherd init .
```

### CLI Usage

```bash
agent-shepherd init <path>                     # Register a project
agent-shepherd submit [--title] [--context]    # Submit PR from current branch
agent-shepherd status <prId>                   # Check PR status
agent-shepherd batch <prId> --file <json>      # Batch submit comments/replies
agent-shepherd ready <prId>                    # Signal ready for re-review
agent-shepherd setup                           # Install skills + verify prerequisites
agent-shepherd start [--port 3847]             # Start the server
```

## Skills

Agent Shepherd ships three [Claude Code skills](https://github.com/vercel-labs/skills) that teach agents how to interact with the review workflow:

| Skill | Purpose |
|---|---|
| `shepherd-respond-to-review` | Guides agents through severity handling, batch response format, and the CLI workflow for addressing review comments |
| `shepherd-submit-pr` | Guides agents through commit preparation, context file creation, and the submit workflow |
| `shepherd-context-guidelines` | Guides agents on writing structured context files for PR submissions |

Skills are installed automatically by `agent-shepherd setup` via `npx skills add`. They are installed globally to `~/.claude/skills/` so they are available in all repositories.

## Local Development

### One-time setup

```bash
npm install
npm run setup:dev
```

`setup:dev` does three things:
1. **Builds** all packages (`npm run build`)
2. **Links the CLI** via `npm link` -- puts `agent-shepherd` on your PATH pointing at the local repo's build output
3. **Symlinks skills** into `~/.claude/skills/` -- because they're symlinks (not copies), edits to `skills/` are reflected immediately without re-running setup

After setup, verify everything is working:
```bash
agent-shepherd --version   # CLI is on PATH
ls -la ~/.claude/skills/   # Skills are symlinked
```

### Day-to-day development

```bash
# Start backend (port 3847) + frontend (port 5173) with hot reload
npm run dev

# Or run individually:
npm run dev --workspace=packages/backend    # API on :3847
npm run dev --workspace=packages/frontend   # UI on :5173
```

The frontend runs on its own Vite dev server with HMR. In production (`agent-shepherd start`), the backend serves the built frontend as static files.

### Build & test

```bash
npm run build          # Build all packages
npm run test           # Run tests across all packages
npm run lint           # Lint all packages
```

### Adding new skills

If you add a new skill directory under `skills/`, run `npm run link-skills` to symlink it into `~/.claude/skills/`. Edits to existing skills need no action -- they're already symlinked.

### Switching away from dev mode

To remove the dev symlinks (e.g. to install the published version of skills instead):

```bash
npm run teardown:dev
```

This unlinks the CLI from PATH and removes the skill symlinks from `~/.claude/skills/`.

## Core Concepts

### Review Cycle

Each PR goes through numbered review cycles. A cycle captures:
- The diff snapshot at that point in time
- All comments (with severity levels and threading)
- The human's review decision (approve or request changes)

### Comment Severity

Comments have three severity levels that guide agent behavior:

| Severity | Agent behavior |
|---|---|
| **must-fix** | Make the change, no discussion |
| **request** | Make the change unless there's a strong technical reason not to (explain in reply) |
| **suggestion** | Use judgment -- fix or reply with reasoning |

### Agent Orchestration

When a human requests changes, the orchestrator:
1. Collects all comments from the current review cycle
2. Builds a structured prompt grouped by file with severity instructions
3. Spawns the agent in **resume mode** (preserving context) or **new session mode** (clean slate)
4. The agent works, posts replies via the CLI, and signals ready
5. A new review cycle begins

### Session Modes

- **Resume (default):** `claude --resume <sessionId>` -- agent retains full context. Best for natural iteration.
- **New session:** Clean context with PR metadata injected. Better for long-lived PRs with many rounds.

## Data Model

**Projects** hold multiple **Pull Requests**, each with sequential **Review Cycles**. Cycles contain **Comments** (threaded, with severity) and **Diff Snapshots** preserving the code state at each review round.

## API

REST endpoints under `/api/`:

| Resource | Endpoints |
|---|---|
| Projects | `GET/POST /projects`, `GET/PUT/DELETE /projects/:id` |
| Pull Requests | `GET/POST /projects/:id/prs`, `GET/PUT /prs/:id` |
| Reviews | `POST /prs/:id/review`, `POST /prs/:id/agent-ready` |
| Comments | `GET/POST /prs/:prId/comments`, `PUT/DELETE /comments/:id`, `POST /prs/:prId/comments/batch` |
| Diffs | `GET /prs/:id/diff?cycle=N` |
| Config | `GET/PUT /config`, `GET/PUT /projects/:id/config` |

WebSocket events: `pr:*`, `comment:*`, `review:submitted`, `agent:*`

## Design Documents

- [Architecture & Design](docs/plans/2026-02-24-agent-shepherd-design.md)
- [Implementation Plan](docs/plans/2026-02-24-agent-shepherd-implementation.md)
- [Multi-line Comments](docs/plans/2026-02-25-multi-line-comments.md)
