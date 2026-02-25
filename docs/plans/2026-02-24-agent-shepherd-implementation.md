# Agent Shepherd Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local human-in-the-loop PR review application for AI coding agents.

**Architecture:** Monorepo with three packages (backend, frontend, cli). Fastify backend with SQLite/Drizzle, React frontend with git-diff-view, commander CLI. Agent orchestration via Claude Code CLI adapter.

**Tech Stack:** Node.js, TypeScript, Fastify, Drizzle ORM, better-sqlite3, React, Vite, git-diff-view, @git-diff-view/shiki, Tailwind CSS, commander, simple-git, Vitest

---

## Phase 1: Project Foundation

### Task 1: Monorepo Scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `.gitignore`

**Step 1: Create root package.json with workspaces**

```json
{
  "name": "agent-shepherd",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=packages/backend & npm run dev --workspace=packages/frontend",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Step 3: Create shared package**

`packages/shared/package.json`:
```json
{
  "name": "@agent-shepherd/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:
```typescript
export * from './types.js';
```

`packages/shared/src/types.ts`:
```typescript
// Shared types - populated in Task 3
```

**Step 4: Create backend package**

`packages/backend/package.json`:
```json
{
  "name": "@agent-shepherd/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@agent-shepherd/shared": "*"
  }
}
```

`packages/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 5: Create frontend package**

`packages/frontend/package.json`:
```json
{
  "name": "@agent-shepherd/frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@agent-shepherd/shared": "*"
  }
}
```

`packages/frontend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

**Step 6: Create CLI package**

`packages/cli/package.json`:
```json
{
  "name": "@agent-shepherd/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "shepherd": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@agent-shepherd/shared": "*"
  }
}
```

`packages/cli/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 7: Create .gitignore**

```
node_modules/
dist/
*.db
*.db-journal
.env
.DS_Store
```

**Step 8: Install dependencies and verify**

Run: `npm install`
Expected: Clean install, workspaces linked

Run: `npm run build --workspace=packages/shared`
Expected: Builds successfully (once we add the shared types)

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with backend, frontend, cli, shared packages"
```

---

### Task 2: Install Core Dependencies

**Step 1: Install shared dependencies**

```bash
npm install --save-dev typescript vitest @types/node -w packages/shared
```

**Step 2: Install backend dependencies**

```bash
npm install fastify @fastify/websocket @fastify/cors @fastify/static better-sqlite3 drizzle-orm simple-git uuid node-notifier -w packages/backend
npm install --save-dev @types/better-sqlite3 @types/uuid @types/node @types/node-notifier tsx drizzle-kit typescript vitest -w packages/backend
```

**Step 3: Install frontend dependencies**

```bash
npm install react react-dom react-router-dom @git-diff-view/react @git-diff-view/shiki shiki -w packages/frontend
npm install --save-dev @types/react @types/react-dom @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript vitest jsdom @testing-library/react @testing-library/jest-dom -w packages/frontend
```

**Step 4: Install CLI dependencies**

```bash
npm install commander -w packages/cli
npm install --save-dev typescript vitest @types/node -w packages/cli
```

**Step 5: Verify installs**

Run: `npm ls --depth=0 -w packages/backend`
Expected: All backend deps listed without errors

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: install core dependencies for all packages"
```

---

### Task 3: Shared Types

**Files:**
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/src/__tests__/types.test.ts`

**Step 1: Write the type validation test**

`packages/shared/src/__tests__/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type {
  Project,
  PullRequest,
  ReviewCycle,
  Comment,
  DiffSnapshot,
  PRStatus,
  ReviewCycleStatus,
  CommentSeverity,
  CommentAuthor,
  BatchCommentPayload,
} from '../types.js';

describe('Shared Types', () => {
  it('PRStatus has correct values', () => {
    const statuses: PRStatus[] = ['open', 'approved', 'closed'];
    expect(statuses).toHaveLength(3);
  });

  it('ReviewCycleStatus has correct values', () => {
    const statuses: ReviewCycleStatus[] = [
      'pending_review',
      'in_review',
      'changes_requested',
      'pending_agent',
      'approved',
    ];
    expect(statuses).toHaveLength(5);
  });

  it('CommentSeverity has correct values', () => {
    const severities: CommentSeverity[] = ['suggestion', 'request', 'must-fix'];
    expect(severities).toHaveLength(3);
  });

  it('can construct a valid Project', () => {
    const project: Project = {
      id: 'uuid-1',
      name: 'test-project',
      path: '/tmp/repo',
      baseBranch: 'main',
      createdAt: new Date().toISOString(),
    };
    expect(project.name).toBe('test-project');
  });

  it('can construct a valid BatchCommentPayload', () => {
    const payload: BatchCommentPayload = {
      comments: [
        { filePath: 'src/index.ts', startLine: 1, endLine: 1, body: 'test', severity: 'suggestion' },
      ],
      replies: [
        { commentId: 'abc', body: 'reply' },
      ],
    };
    expect(payload.comments).toHaveLength(1);
    expect(payload.replies).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/shared`
Expected: FAIL — types not defined yet

**Step 3: Write the types**

`packages/shared/src/types.ts`:
```typescript
export type PRStatus = 'open' | 'approved' | 'closed';

export type ReviewCycleStatus =
  | 'pending_review'
  | 'in_review'
  | 'changes_requested'
  | 'pending_agent'
  | 'approved';

export type CommentSeverity = 'suggestion' | 'request' | 'must-fix';

export type CommentAuthor = 'human' | 'agent';

export interface Project {
  id: string;
  name: string;
  path: string;
  baseBranch: string;
  createdAt: string;
}

export interface PullRequest {
  id: string;
  projectId: string;
  title: string;
  description: string;
  sourceBranch: string;
  baseBranch: string;
  status: PRStatus;
  agentContext: string | null;
  agentSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: ReviewCycleStatus;
  reviewedAt: string | null;
  agentCompletedAt: string | null;
}

export interface Comment {
  id: string;
  reviewCycleId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: CommentSeverity;
  author: CommentAuthor;
  parentCommentId: string | null;
  resolved: boolean;
  createdAt: string;
}

export interface DiffSnapshot {
  id: string;
  reviewCycleId: string;
  diffData: string;
}

export interface BatchCommentPayload {
  comments?: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    body: string;
    severity: CommentSeverity;
  }>;
  replies?: Array<{
    commentId: string;
    body: string;
  }>;
}

export interface CreateProjectInput {
  name: string;
  path: string;
  baseBranch?: string;
}

export interface CreatePRInput {
  projectId: string;
  title: string;
  description: string;
  sourceBranch: string;
  baseBranch?: string;
  agentContext?: string;
  agentSessionId?: string;
}

export interface CreateCommentInput {
  reviewCycleId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: CommentSeverity;
  author: CommentAuthor;
  parentCommentId?: string;
}

export interface SubmitReviewInput {
  action: 'approve' | 'request-changes';
}

export interface AgentAdapterConfig {
  name: string;
  sessionMode: 'resume' | 'new';
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/shared`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared types for projects, PRs, comments, review cycles"
```

---

### Task 4: Database Schema (Drizzle)

**Files:**
- Create: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/src/db/index.ts`
- Create: `packages/backend/drizzle.config.ts`
- Test: `packages/backend/src/db/__tests__/schema.test.ts`

**Step 1: Write the schema test**

`packages/backend/src/db/__tests__/schema.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('Database Schema', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite, { schema });
    // Create tables directly for testing
    sqlite.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        base_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE pull_requests (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_branch TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        agent_context TEXT,
        agent_session_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE review_cycles (
        id TEXT PRIMARY KEY,
        pr_id TEXT NOT NULL REFERENCES pull_requests(id),
        cycle_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_at TEXT,
        agent_completed_at TEXT
      );
      CREATE TABLE comments (
        id TEXT PRIMARY KEY,
        review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        body TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'suggestion',
        author TEXT NOT NULL,
        parent_comment_id TEXT REFERENCES comments(id),
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE diff_snapshots (
        id TEXT PRIMARY KEY,
        review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
        diff_data TEXT NOT NULL
      );
      CREATE TABLE global_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE project_config (
        project_id TEXT NOT NULL REFERENCES projects(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('can insert and query a project', () => {
    const id = randomUUID();
    db.insert(schema.projects).values({
      id,
      name: 'test-project',
      path: '/tmp/test-repo',
      baseBranch: 'main',
    }).run();

    const result = db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    expect(result).toBeDefined();
    expect(result!.name).toBe('test-project');
    expect(result!.path).toBe('/tmp/test-repo');
  });

  it('can insert and query a pull request', () => {
    const projectId = randomUUID();
    const prId = randomUUID();

    db.insert(schema.projects).values({
      id: projectId,
      name: 'test',
      path: '/tmp/repo',
      baseBranch: 'main',
    }).run();

    db.insert(schema.pullRequests).values({
      id: prId,
      projectId,
      title: 'Add feature',
      description: 'A new feature',
      sourceBranch: 'feat/new',
      baseBranch: 'main',
      status: 'open',
    }).run();

    const result = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, prId)).get();
    expect(result).toBeDefined();
    expect(result!.title).toBe('Add feature');
    expect(result!.status).toBe('open');
  });

  it('can insert a comment with thread parent', () => {
    const projectId = randomUUID();
    const prId = randomUUID();
    const cycleId = randomUUID();
    const commentId = randomUUID();
    const replyId = randomUUID();

    db.insert(schema.projects).values({ id: projectId, name: 'test', path: '/tmp/r', baseBranch: 'main' }).run();
    db.insert(schema.pullRequests).values({ id: prId, projectId, title: 'PR', description: '', sourceBranch: 'feat', baseBranch: 'main', status: 'open' }).run();
    db.insert(schema.reviewCycles).values({ id: cycleId, prId, cycleNumber: 1, status: 'in_review' }).run();

    db.insert(schema.comments).values({
      id: commentId,
      reviewCycleId: cycleId,
      filePath: 'src/index.ts',
      startLine: 10,
      endLine: 10,
      body: 'This needs fixing',
      severity: 'must-fix',
      author: 'human',
      resolved: false,
    }).run();

    db.insert(schema.comments).values({
      id: replyId,
      reviewCycleId: cycleId,
      filePath: 'src/index.ts',
      startLine: 10,
      endLine: 10,
      body: 'Fixed it',
      severity: 'suggestion',
      author: 'agent',
      parentCommentId: commentId,
      resolved: false,
    }).run();

    const reply = db.select().from(schema.comments).where(eq(schema.comments.id, replyId)).get();
    expect(reply).toBeDefined();
    expect(reply!.parentCommentId).toBe(commentId);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL — schema module not found

**Step 3: Write the schema**

`packages/backend/src/db/schema.ts`:
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  baseBranch: text('base_branch').notNull().default('main'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const pullRequests = sqliteTable('pull_requests', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  sourceBranch: text('source_branch').notNull(),
  baseBranch: text('base_branch').notNull(),
  status: text('status').notNull().default('open'),
  agentContext: text('agent_context'),
  agentSessionId: text('agent_session_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const reviewCycles = sqliteTable('review_cycles', {
  id: text('id').primaryKey(),
  prId: text('pr_id').notNull().references(() => pullRequests.id),
  cycleNumber: integer('cycle_number').notNull(),
  status: text('status').notNull().default('pending_review'),
  reviewedAt: text('reviewed_at'),
  agentCompletedAt: text('agent_completed_at'),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  reviewCycleId: text('review_cycle_id').notNull().references(() => reviewCycles.id),
  filePath: text('file_path').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  body: text('body').notNull(),
  severity: text('severity').notNull().default('suggestion'),
  author: text('author').notNull(),
  parentCommentId: text('parent_comment_id').references((): any => comments.id),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const diffSnapshots = sqliteTable('diff_snapshots', {
  id: text('id').primaryKey(),
  reviewCycleId: text('review_cycle_id').notNull().references(() => reviewCycles.id),
  diffData: text('diff_data').notNull(),
});

export const globalConfig = sqliteTable('global_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const projectConfig = sqliteTable('project_config', {
  projectId: text('project_id').notNull().references(() => projects.id),
  key: text('key').notNull(),
  value: text('value').notNull(),
});
```

**Step 4: Write the database initialization module**

`packages/backend/src/db/index.ts`:
```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export function createDb(dbPath: string = './shepherd.db') {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      base_branch TEXT NOT NULL DEFAULT 'main',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pull_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_branch TEXT NOT NULL,
      base_branch TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      agent_context TEXT,
      agent_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS review_cycles (
      id TEXT PRIMARY KEY,
      pr_id TEXT NOT NULL REFERENCES pull_requests(id),
      cycle_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_review',
      reviewed_at TEXT,
      agent_completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      body TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'suggestion',
      author TEXT NOT NULL,
      parent_comment_id TEXT REFERENCES comments(id),
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS diff_snapshots (
      id TEXT PRIMARY KEY,
      review_cycle_id TEXT NOT NULL REFERENCES review_cycles(id),
      diff_data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS global_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_config (
      project_id TEXT NOT NULL REFERENCES projects(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (project_id, key)
    );
  `);

  return { db, sqlite };
}

export { schema };
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/db/ packages/backend/drizzle.config.ts
git commit -m "feat: add database schema and initialization with Drizzle ORM"
```

---

## Phase 2: Backend API

### Task 5: Fastify Server Bootstrap

**Files:**
- Create: `packages/backend/src/index.ts`
- Create: `packages/backend/src/server.ts`
- Test: `packages/backend/src/__tests__/server.test.ts`

**Step 1: Write the server test**

`packages/backend/src/__tests__/server.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('Server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responds to health check', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL — server module not found

**Step 3: Write the server**

`packages/backend/src/server.ts`:
```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createDb } from './db/index.js';

export interface ServerOptions {
  dbPath?: string;
  port?: number;
  host?: string;
}

export async function buildServer(opts: ServerOptions = {}) {
  const { dbPath = './shepherd.db', port = 3847, host = '127.0.0.1' } = opts;

  const fastify = Fastify({ logger: false });

  await fastify.register(cors, { origin: true });

  const { db, sqlite } = createDb(dbPath);

  fastify.decorate('db', db);
  fastify.decorate('sqlite', sqlite);

  fastify.addHook('onClose', () => {
    sqlite.close();
  });

  fastify.get('/api/health', async () => {
    return { status: 'ok' };
  });

  return fastify;
}
```

`packages/backend/src/index.ts`:
```typescript
import { buildServer } from './server.js';

const port = parseInt(process.env.SHEPHERD_PORT || '3847', 10);
const host = process.env.SHEPHERD_HOST || '127.0.0.1';

async function main() {
  const server = await buildServer({ port, host });
  await server.listen({ port, host });
  console.log(`Agent Shepherd running at http://${host}:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add Fastify server bootstrap with health check"
```

---

### Task 6: Projects API

**Files:**
- Create: `packages/backend/src/routes/projects.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/routes/__tests__/projects.test.ts`

**Step 1: Write the projects route tests**

`packages/backend/src/routes/__tests__/projects.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Projects API', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/projects creates a project', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'my-app', path: '/tmp/my-app', baseBranch: 'main' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('my-app');
    expect(body.path).toBe('/tmp/my-app');
    expect(body.id).toBeDefined();
  });

  it('GET /api/projects lists projects', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj1', path: '/tmp/p1' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj2', path: '/tmp/p2' },
    });

    const response = await server.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
  });

  it('GET /api/projects/:id returns a project', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('proj');
  });

  it('GET /api/projects/:id returns 404 for missing project', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/projects/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/projects/:id removes a project', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = create.json();

    const del = await server.inject({
      method: 'DELETE',
      url: `/api/projects/${id}`,
    });
    expect(del.statusCode).toBe(204);

    const get = await server.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
    });
    expect(get.statusCode).toBe(404);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL — routes not registered

**Step 3: Write the projects route**

`packages/backend/src/routes/projects.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

export async function projectRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  fastify.post('/api/projects', async (request, reply) => {
    const { name, path, baseBranch } = request.body as {
      name: string;
      path: string;
      baseBranch?: string;
    };

    const id = randomUUID();
    db.insert(schema.projects)
      .values({ id, name, path, baseBranch: baseBranch || 'main' })
      .run();

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    reply.code(201).send(project);
  });

  fastify.get('/api/projects', async () => {
    return db.select().from(schema.projects).all();
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }
    return project;
  });

  fastify.put('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{ name: string; path: string; baseBranch: string }>;

    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    db.update(schema.projects).set(updates).where(eq(schema.projects.id, id)).run();

    return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!existing) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    db.delete(schema.projects).where(eq(schema.projects.id, id)).run();
    reply.code(204).send();
  });
}
```

**Step 4: Register routes in server.ts**

Add to `packages/backend/src/server.ts` before the health check:
```typescript
import { projectRoutes } from './routes/projects.js';
// ... inside buildServer, after decorating db:
await fastify.register(projectRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/
git commit -m "feat: add Projects CRUD API endpoints"
```

---

### Task 7: Pull Requests API

**Files:**
- Create: `packages/backend/src/routes/pull-requests.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/routes/__tests__/pull-requests.test.ts`

**Step 1: Write the PR route tests**

`packages/backend/src/routes/__tests__/pull-requests.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Pull Requests API', () => {
  let server: FastifyInstance;
  let projectId: string;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
    const res = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = res.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/projects/:id/prs creates a PR with review cycle', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Add feature',
        description: 'New feature',
        sourceBranch: 'feat/new',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('Add feature');
    expect(body.status).toBe('open');
  });

  it('GET /api/projects/:id/prs lists PRs', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR1', description: '', sourceBranch: 'feat/1' },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/prs`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('GET /api/prs/:id returns a PR', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: 'desc', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('PR');
  });

  it('POST /api/prs/:id/review approves a PR', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'approve' },
    });
    expect(response.statusCode).toBe(200);

    const pr = await server.inject({ method: 'GET', url: `/api/prs/${id}` });
    expect(pr.json().status).toBe('approved');
  });

  it('POST /api/prs/:id/review requests changes', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('changes_requested');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL

**Step 3: Write the pull requests route**

`packages/backend/src/routes/pull-requests.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

export async function pullRequestRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  // Create a PR (also creates first review cycle)
  fastify.post('/api/projects/:projectId/prs', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { title, description, sourceBranch, baseBranch, agentContext, agentSessionId } =
      request.body as {
        title: string;
        description?: string;
        sourceBranch: string;
        baseBranch?: string;
        agentContext?: string;
        agentSessionId?: string;
      };

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const prId = randomUUID();
    const cycleId = randomUUID();
    const now = new Date().toISOString();

    db.insert(schema.pullRequests).values({
      id: prId,
      projectId,
      title,
      description: description || '',
      sourceBranch,
      baseBranch: baseBranch || project.baseBranch,
      status: 'open',
      agentContext: agentContext || null,
      agentSessionId: agentSessionId || null,
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.reviewCycles).values({
      id: cycleId,
      prId,
      cycleNumber: 1,
      status: 'pending_review',
    }).run();

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, prId)).get();
    reply.code(201).send(pr);
  });

  // List PRs for a project
  fastify.get('/api/projects/:projectId/prs', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return db.select().from(schema.pullRequests).where(eq(schema.pullRequests.projectId, projectId)).all();
  });

  // Get a single PR
  fastify.get('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }
    return pr;
  });

  // Update a PR
  fastify.put('/api/prs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{
      title: string;
      description: string;
      status: string;
      agentContext: string;
      agentSessionId: string;
    }>;

    const existing = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!existing) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    db.update(schema.pullRequests)
      .set({ ...updates, updatedAt: new Date().toISOString() })
      .where(eq(schema.pullRequests.id, id))
      .run();

    return db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
  });

  // Submit a review
  fastify.post('/api/prs/:id/review', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { action } = request.body as { action: 'approve' | 'request-changes' };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    // Get the current review cycle
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();
    const currentCycle = cycles[cycles.length - 1];

    const now = new Date().toISOString();

    if (action === 'approve') {
      db.update(schema.pullRequests)
        .set({ status: 'approved', updatedAt: now })
        .where(eq(schema.pullRequests.id, id))
        .run();

      if (currentCycle) {
        db.update(schema.reviewCycles)
          .set({ status: 'approved', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, currentCycle.id))
          .run();
      }

      return { status: 'approved' };
    } else {
      if (currentCycle) {
        db.update(schema.reviewCycles)
          .set({ status: 'changes_requested', reviewedAt: now })
          .where(eq(schema.reviewCycles.id, currentCycle.id))
          .run();
      }

      return { status: 'changes_requested' };
    }
  });

  // Agent signals ready for re-review
  fastify.post('/api/prs/:id/agent-ready', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id))
      .all();
    const currentCycle = cycles[cycles.length - 1];

    const now = new Date().toISOString();

    // Mark current cycle as agent-completed
    if (currentCycle) {
      db.update(schema.reviewCycles)
        .set({ agentCompletedAt: now })
        .where(eq(schema.reviewCycles.id, currentCycle.id))
        .run();
    }

    // Create new review cycle
    const newCycleId = randomUUID();
    db.insert(schema.reviewCycles).values({
      id: newCycleId,
      prId: id,
      cycleNumber: (currentCycle?.cycleNumber || 0) + 1,
      status: 'pending_review',
    }).run();

    db.update(schema.pullRequests)
      .set({ updatedAt: now })
      .where(eq(schema.pullRequests.id, id))
      .run();

    return { status: 'pending_review', cycleNumber: (currentCycle?.cycleNumber || 0) + 1 };
  });

  // Get review cycles for a PR
  fastify.get('/api/prs/:id/cycles', async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(schema.reviewCycles).where(eq(schema.reviewCycles.prId, id)).all();
  });
}
```

**Step 4: Register routes in server.ts**

Add to `packages/backend/src/server.ts`:
```typescript
import { pullRequestRoutes } from './routes/pull-requests.js';
// inside buildServer:
await fastify.register(pullRequestRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/
git commit -m "feat: add Pull Requests API with review cycles"
```

---

### Task 8: Comments API

**Files:**
- Create: `packages/backend/src/routes/comments.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/routes/__tests__/comments.test.ts`

**Step 1: Write the comments route tests**

`packages/backend/src/routes/__tests__/comments.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Comments API', () => {
  let server: FastifyInstance;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
    const proj = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = proj.json().id;

    const pr = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/prs/:id/comments adds a comment', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        body: 'This needs work',
        severity: 'must-fix',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().severity).toBe('must-fix');
  });

  it('GET /api/prs/:id/comments lists comments', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'comment 1',
        severity: 'suggestion',
        author: 'human',
      },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('supports threaded replies via parentCommentId', async () => {
    const parent = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Fix this',
        severity: 'request',
        author: 'human',
      },
    });
    const parentId = parent.json().id;

    const reply = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Done',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: parentId,
      },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().parentCommentId).toBe(parentId);
  });

  it('PUT /api/comments/:id resolves a comment', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'test',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const commentId = create.json().id;

    const response = await server.inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().resolved).toBe(true);
  });

  it('POST /api/prs/:id/comments/batch handles batch comments', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'c1', severity: 'suggestion' },
          { filePath: 'src/b.ts', startLine: 2, endLine: 2, body: 'c2', severity: 'request' },
        ],
        replies: [],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().created).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL

**Step 3: Write the comments route**

`packages/backend/src/routes/comments.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';
import type { CommentSeverity, CommentAuthor, BatchCommentPayload } from '@agent-shepherd/shared';

export async function commentRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  function getCurrentCycleId(prId: string): string | null {
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    return cycles.length > 0 ? cycles[cycles.length - 1].id : null;
  }

  // Add a comment to a PR (on the current review cycle)
  fastify.post('/api/prs/:prId/comments', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { filePath, startLine, endLine, body, severity, author, parentCommentId } =
      request.body as {
        filePath: string;
        startLine: number;
        endLine: number;
        body: string;
        severity: CommentSeverity;
        author: CommentAuthor;
        parentCommentId?: string;
      };

    const cycleId = getCurrentCycleId(prId);
    if (!cycleId) {
      reply.code(404).send({ error: 'No review cycle found' });
      return;
    }

    const id = randomUUID();
    db.insert(schema.comments).values({
      id,
      reviewCycleId: cycleId,
      filePath,
      startLine,
      endLine,
      body,
      severity,
      author,
      parentCommentId: parentCommentId || null,
      resolved: false,
    }).run();

    const comment = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
    reply.code(201).send(comment);
  });

  // List comments for a PR (all cycles)
  fastify.get('/api/prs/:prId/comments', async (request) => {
    const { prId } = request.params as { prId: string };
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();

    const cycleIds = cycles.map((c: any) => c.id);
    if (cycleIds.length === 0) return [];

    const allComments = [];
    for (const cycleId of cycleIds) {
      const comments = db
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.reviewCycleId, cycleId))
        .all();
      allComments.push(...comments);
    }
    return allComments;
  });

  // Update a comment
  fastify.put('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<{ body: string; resolved: boolean }>;

    const existing = db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
    if (!existing) {
      reply.code(404).send({ error: 'Comment not found' });
      return;
    }

    db.update(schema.comments).set(updates).where(eq(schema.comments.id, id)).run();
    return db.select().from(schema.comments).where(eq(schema.comments.id, id)).get();
  });

  // Delete a comment
  fastify.delete('/api/comments/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    db.delete(schema.comments).where(eq(schema.comments.id, id)).run();
    reply.code(204).send();
  });

  // Batch comments
  fastify.post('/api/prs/:prId/comments/batch', async (request, reply) => {
    const { prId } = request.params as { prId: string };
    const { comments, replies } = request.body as BatchCommentPayload;

    const cycleId = getCurrentCycleId(prId);
    if (!cycleId) {
      reply.code(404).send({ error: 'No review cycle found' });
      return;
    }

    let created = 0;

    if (comments) {
      for (const c of comments) {
        const id = randomUUID();
        db.insert(schema.comments).values({
          id,
          reviewCycleId: cycleId,
          filePath: c.filePath,
          startLine: c.startLine,
          endLine: c.endLine,
          body: c.body,
          severity: c.severity,
          author: 'agent' as CommentAuthor,
          resolved: false,
        }).run();
        created++;
      }
    }

    if (replies) {
      for (const r of replies) {
        const parent = db.select().from(schema.comments).where(eq(schema.comments.id, r.commentId)).get();
        if (parent) {
          const id = randomUUID();
          db.insert(schema.comments).values({
            id,
            reviewCycleId: cycleId,
            filePath: (parent as any).filePath,
            startLine: (parent as any).startLine,
            endLine: (parent as any).endLine,
            body: r.body,
            severity: 'suggestion',
            author: 'agent' as CommentAuthor,
            parentCommentId: r.commentId,
            resolved: false,
          }).run();
          created++;
        }
      }
    }

    reply.code(201).send({ created });
  });
}
```

**Step 4: Register routes in server.ts**

Add to `packages/backend/src/server.ts`:
```typescript
import { commentRoutes } from './routes/comments.js';
// inside buildServer:
await fastify.register(commentRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/
git commit -m "feat: add Comments API with threading and batch support"
```

---

### Task 9: Git Diff Service

**Files:**
- Create: `packages/backend/src/services/git.ts`
- Test: `packages/backend/src/services/__tests__/git.test.ts`

**Step 1: Write the git service test**

`packages/backend/src/services/__tests__/git.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitService } from '../git.js';

describe('GitService', () => {
  let repoPath: string;
  let gitService: GitService;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'shepherd-test-'));
    gitService = new GitService(repoPath);

    // Init a git repo with a file on main
    const { execSync } = await import('child_process');
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });
    await writeFile(join(repoPath, 'file.txt'), 'hello\n');
    execSync('git add . && git commit -m "initial"', { cwd: repoPath });
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it('gets the current branch', async () => {
    const branch = await gitService.getCurrentBranch();
    expect(branch).toMatch(/main|master/);
  });

  it('gets diff between branches', async () => {
    const { execSync } = await import('child_process');
    execSync('git checkout -b feat/test', { cwd: repoPath });
    await writeFile(join(repoPath, 'file.txt'), 'hello\nworld\n');
    execSync('git add . && git commit -m "add world"', { cwd: repoPath });

    const diff = await gitService.getDiff('main', 'feat/test');
    expect(diff).toContain('+world');
  });

  it('lists changed files', async () => {
    const { execSync } = await import('child_process');
    execSync('git checkout -b feat/test2', { cwd: repoPath });
    await writeFile(join(repoPath, 'new-file.txt'), 'new\n');
    execSync('git add . && git commit -m "add file"', { cwd: repoPath });

    const files = await gitService.getChangedFiles('main', 'feat/test2');
    expect(files).toContain('new-file.txt');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL

**Step 3: Write the git service**

`packages/backend/src/services/git.ts`:
```typescript
import simpleGit, { type SimpleGit } from 'simple-git';

export class GitService {
  private git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  async getDiff(baseBranch: string, sourceBranch: string): Promise<string> {
    const result = await this.git.diff([`${baseBranch}...${sourceBranch}`]);
    return result;
  }

  async getChangedFiles(baseBranch: string, sourceBranch: string): Promise<string[]> {
    const result = await this.git.diff(['--name-only', `${baseBranch}...${sourceBranch}`]);
    return result.trim().split('\n').filter(Boolean);
  }

  async getFileContent(ref: string, filePath: string): Promise<string> {
    const result = await this.git.show([`${ref}:${filePath}`]);
    return result;
  }

  async log(baseBranch: string, sourceBranch: string) {
    return this.git.log({ from: baseBranch, to: sourceBranch });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/services/
git commit -m "feat: add GitService for diff and branch operations"
```

---

### Task 10: Diff API Endpoint

**Files:**
- Create: `packages/backend/src/routes/diff.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/routes/__tests__/diff.test.ts`

**Step 1: Write the diff route test**

`packages/backend/src/routes/__tests__/diff.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import type { FastifyInstance } from 'fastify';

describe('Diff API', () => {
  let server: FastifyInstance;
  let repoPath: string;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    // Create a test repo with two branches
    repoPath = await mkdtemp(join(tmpdir(), 'shepherd-diff-'));
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });
    await writeFile(join(repoPath, 'index.ts'), 'const x = 1;\n');
    execSync('git add . && git commit -m "init"', { cwd: repoPath });
    execSync('git checkout -b feat/change', { cwd: repoPath });
    await writeFile(join(repoPath, 'index.ts'), 'const x = 1;\nconst y = 2;\n');
    execSync('git add . && git commit -m "add y"', { cwd: repoPath });

    server = await buildServer({ dbPath: ':memory:' });

    const proj = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: repoPath },
    });
    projectId = proj.json().id;

    const pr = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Add y', description: '', sourceBranch: 'feat/change' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it('GET /api/prs/:id/diff returns the diff', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diff).toContain('+const y = 2;');
    expect(body.files).toContain('index.ts');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL

**Step 3: Write the diff route**

`packages/backend/src/routes/diff.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema } from '../db/index.js';
import { GitService } from '../services/git.js';

export async function diffRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  fastify.get('/api/prs/:id/diff', async (request, reply) => {
    const { id } = request.params as { id: string };

    const pr = db.select().from(schema.pullRequests).where(eq(schema.pullRequests.id, id)).get();
    if (!pr) {
      reply.code(404).send({ error: 'Pull request not found' });
      return;
    }

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, (pr as any).projectId)).get();
    if (!project) {
      reply.code(404).send({ error: 'Project not found' });
      return;
    }

    const gitService = new GitService((project as any).path);
    const diff = await gitService.getDiff((pr as any).baseBranch, (pr as any).sourceBranch);
    const files = await gitService.getChangedFiles((pr as any).baseBranch, (pr as any).sourceBranch);

    return { diff, files };
  });
}
```

**Step 4: Register routes in server.ts**

Add to `packages/backend/src/server.ts`:
```typescript
import { diffRoutes } from './routes/diff.js';
// inside buildServer:
await fastify.register(diffRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/diff.ts
git commit -m "feat: add Diff API endpoint using GitService"
```

---

## Phase 3: CLI

### Task 11: CLI Foundation + Init & Submit Commands

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/api-client.ts`
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/submit.ts`
- Test: `packages/cli/src/__tests__/api-client.test.ts`

**Step 1: Write the API client test**

`packages/cli/src/__tests__/api-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../api-client.js';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3847');
  });

  it('constructs URLs correctly', () => {
    expect((client as any).url('/api/projects')).toBe('http://localhost:3847/api/projects');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/cli`
Expected: FAIL

**Step 3: Write the API client and CLI commands**

`packages/cli/src/api-client.ts`:
```typescript
export class ApiClient {
  constructor(private baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }
}
```

`packages/cli/src/commands/init.ts`:
```typescript
import { Command } from 'commander';
import { resolve } from 'path';
import { basename } from 'path';
import { ApiClient } from '../api-client.js';

export function initCommand(program: Command, client: ApiClient) {
  program
    .command('init [path]')
    .description('Register a project with Agent Shepherd')
    .option('-n, --name <name>', 'Project name')
    .option('-b, --base-branch <branch>', 'Base branch', 'main')
    .action(async (path: string | undefined, opts: { name?: string; baseBranch: string }) => {
      const projectPath = resolve(path || '.');
      const name = opts.name || basename(projectPath);

      const project = await client.post('/api/projects', {
        name,
        path: projectPath,
        baseBranch: opts.baseBranch,
      });
      console.log(`Project registered: ${(project as any).name} (${(project as any).id})`);
    });
}
```

`packages/cli/src/commands/submit.ts`:
```typescript
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function submitCommand(program: Command, client: ApiClient) {
  program
    .command('submit')
    .description('Submit a PR from current branch')
    .requiredOption('-p, --project <id>', 'Project ID')
    .option('-t, --title <title>', 'PR title')
    .option('-d, --description <desc>', 'PR description', '')
    .option('-s, --source-branch <branch>', 'Source branch (auto-detected if omitted)')
    .option('-c, --context-file <path>', 'Path to JSON file with agent context')
    .option('--session-id <id>', 'Agent session ID for resume mode')
    .action(async (opts) => {
      let agentContext: string | undefined;
      if (opts.contextFile) {
        agentContext = await readFile(opts.contextFile, 'utf-8');
      }

      const pr = await client.post(`/api/projects/${opts.project}/prs`, {
        title: opts.title || 'Agent PR',
        description: opts.description,
        sourceBranch: opts.sourceBranch || 'HEAD',
        agentContext,
        agentSessionId: opts.sessionId,
      });

      console.log(`PR created: ${(pr as any).id}`);
      console.log(`Title: ${(pr as any).title}`);
      console.log(`Status: ${(pr as any).status}`);
    });
}
```

`packages/cli/src/index.ts`:
```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { initCommand } from './commands/init.js';
import { submitCommand } from './commands/submit.js';

const program = new Command();
const client = new ApiClient(process.env.SHEPHERD_URL || 'http://localhost:3847');

program
  .name('shepherd')
  .description('Agent Shepherd - Human-in-the-loop PR review for AI agents')
  .version('0.1.0');

initCommand(program, client);
submitCommand(program, client);

program.parse();
```

**Step 4: Run tests to verify they pass**

Run: `npm test -w packages/cli`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/
git commit -m "feat: add CLI foundation with init and submit commands"
```

---

### Task 12: CLI Batch, Ready, Status, and Config Commands

**Files:**
- Create: `packages/cli/src/commands/batch.ts`
- Create: `packages/cli/src/commands/ready.ts`
- Create: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Write the batch command**

`packages/cli/src/commands/batch.ts`:
```typescript
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function batchCommand(program: Command, client: ApiClient) {
  program
    .command('batch <pr-id>')
    .description('Batch submit comments and replies')
    .option('-f, --file <path>', 'Path to JSON file with batch payload')
    .option('--stdin', 'Read batch payload from stdin')
    .action(async (prId: string, opts: { file?: string; stdin?: boolean }) => {
      let payload: string;

      if (opts.file) {
        payload = await readFile(opts.file, 'utf-8');
      } else if (opts.stdin) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        payload = Buffer.concat(chunks).toString('utf-8');
      } else {
        console.error('Must specify --file or --stdin');
        process.exit(1);
      }

      const result = await client.post(`/api/prs/${prId}/comments/batch`, JSON.parse(payload));
      console.log(`Batch submitted: ${(result as any).created} items created`);
    });
}
```

**Step 2: Write the ready command**

`packages/cli/src/commands/ready.ts`:
```typescript
import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { ApiClient } from '../api-client.js';

export function readyCommand(program: Command, client: ApiClient) {
  program
    .command('ready <pr-id>')
    .description('Signal PR is ready for re-review')
    .option('-f, --file <path>', 'Batch comments JSON file to submit before signaling ready')
    .action(async (prId: string, opts: { file?: string }) => {
      if (opts.file) {
        const payload = await readFile(opts.file, 'utf-8');
        const result = await client.post(`/api/prs/${prId}/comments/batch`, JSON.parse(payload));
        console.log(`Batch submitted: ${(result as any).created} items created`);
      }

      const result = await client.post(`/api/prs/${prId}/agent-ready`);
      console.log(`PR ready for review (cycle ${(result as any).cycleNumber})`);
    });
}
```

**Step 3: Write the status command**

`packages/cli/src/commands/status.ts`:
```typescript
import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

export function statusCommand(program: Command, client: ApiClient) {
  program
    .command('status <pr-id>')
    .description('Check PR status')
    .action(async (prId: string) => {
      const pr = await client.get<any>(`/api/prs/${prId}`);
      const cycles = await client.get<any[]>(`/api/prs/${prId}/cycles`);
      const currentCycle = cycles[cycles.length - 1];

      console.log(`PR: ${pr.title}`);
      console.log(`Status: ${pr.status}`);
      console.log(`Branch: ${pr.sourceBranch} -> ${pr.baseBranch}`);
      console.log(`Review Cycle: ${currentCycle?.cycleNumber || 0} (${currentCycle?.status || 'none'})`);
    });
}
```

**Step 4: Register all commands in index.ts**

Add imports and registrations for batch, ready, and status commands in `packages/cli/src/index.ts`.

**Step 5: Commit**

```bash
git add packages/cli/src/
git commit -m "feat: add batch, ready, and status CLI commands"
```

---

## Phase 4: Frontend

### Task 13: Vite + React + Tailwind Setup

**Files:**
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.tsx`
- Create: `packages/frontend/src/index.css`

**Step 1: Create Vite config**

`packages/frontend/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3848,
    proxy: {
      '/api': 'http://localhost:3847',
      '/ws': { target: 'ws://localhost:3847', ws: true },
    },
  },
});
```

**Step 2: Create index.html**

`packages/frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Shepherd</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Step 3: Create entry point and App**

`packages/frontend/src/index.css`:
```css
@import "tailwindcss";

:root {
  --color-bg: #ffffff;
  --color-bg-secondary: #f6f8fa;
  --color-text: #1f2328;
  --color-border: #d0d7de;
  --color-accent: #0969da;
  --color-success: #1a7f37;
  --color-warning: #9a6700;
  --color-danger: #cf222e;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0d1117;
    --color-bg-secondary: #161b22;
    --color-text: #e6edf3;
    --color-border: #30363d;
    --color-accent: #58a6ff;
    --color-success: #3fb950;
    --color-warning: #d29922;
    --color-danger: #f85149;
  }
}
```

`packages/frontend/src/main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`packages/frontend/src/App.tsx`:
```typescript
import { Routes, Route } from 'react-router-dom';

export function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<div>Dashboard - Coming soon</div>} />
        </Routes>
      </main>
    </div>
  );
}
```

**Step 4: Verify the dev server starts**

Run: `npm run dev -w packages/frontend`
Expected: Vite dev server starts on port 3848

**Step 5: Commit**

```bash
git add packages/frontend/
git commit -m "feat: scaffold React frontend with Vite, Tailwind, and routing"
```

---

### Task 14: API Client Hook + Dashboard Page

**Files:**
- Create: `packages/frontend/src/api.ts`
- Create: `packages/frontend/src/hooks/useApi.ts`
- Create: `packages/frontend/src/pages/Dashboard.tsx`
- Modify: `packages/frontend/src/App.tsx`

**Step 1: Write the frontend API client**

`packages/frontend/src/api.ts`:
```typescript
const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

export const api = {
  projects: {
    list: () => request<any[]>('/projects'),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (data: any) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  prs: {
    list: (projectId: string) => request<any[]>(`/projects/${projectId}/prs`),
    get: (id: string) => request<any>(`/prs/${id}`),
    diff: (id: string) => request<any>(`/prs/${id}/diff`),
    review: (id: string, action: string) =>
      request<any>(`/prs/${id}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
  },
  comments: {
    list: (prId: string) => request<any[]>(`/prs/${prId}/comments`),
    create: (prId: string, data: any) =>
      request<any>(`/prs/${prId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
```

**Step 2: Write the Dashboard page**

`packages/frontend/src/pages/Dashboard.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects.list().then(setProjects).finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-text)' }}>
          No projects registered. Use <code>shepherd init</code> to register a project.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block p-4 rounded border hover:border-blue-400 transition-colors"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-sm opacity-70">{p.path}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 3: Update App.tsx routes**

Add Dashboard import and route, plus `/projects/:id` and `/prs/:id` placeholder routes.

**Step 4: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add API client, Dashboard page, and routing"
```

---

### Task 15: PR List Page

**Files:**
- Create: `packages/frontend/src/pages/ProjectView.tsx`
- Modify: `packages/frontend/src/App.tsx`

**Step 1: Write the ProjectView page**

Shows PRs for a project in tabs (open/approved/closed). Each PR links to the review page. Includes project name in header.

**Step 2: Add route in App.tsx**

**Step 3: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add Project View page with PR list"
```

---

### Task 16: PR Review Page - Diff Viewer

**Files:**
- Create: `packages/frontend/src/pages/PRReview.tsx`
- Create: `packages/frontend/src/components/DiffViewer.tsx`
- Create: `packages/frontend/src/components/FileTree.tsx`
- Modify: `packages/frontend/src/App.tsx`

**Step 1: Write the FileTree component**

Shows list of changed files with add/modify/delete icons. Clicking a file scrolls to that file's diff.

**Step 2: Write the DiffViewer component**

Uses `@git-diff-view/react` with `@git-diff-view/shiki` for syntax-highlighted code diffs. Supports split/unified toggle. Renders diffs for each changed file.

**Step 3: Write the PRReview page**

Layout: left sidebar with FileTree, right pane with DiffViewer. Header with PR title, branch info, status badge.

**Step 4: Verify with dev server**

Start backend and frontend, create a test project/PR, and verify diffs render.

**Step 5: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add PR Review page with git-diff-view diff rendering"
```

---

### Task 17: Inline Comment System

**Files:**
- Create: `packages/frontend/src/components/CommentWidget.tsx`
- Create: `packages/frontend/src/components/CommentForm.tsx`
- Create: `packages/frontend/src/components/CommentThread.tsx`
- Modify: `packages/frontend/src/components/DiffViewer.tsx`

**Step 1: Write CommentForm component**

Form with textarea, severity dropdown (suggestion/request/must-fix), and submit button. Used for new comments and replies.

**Step 2: Write CommentThread component**

Renders a comment and its replies as a threaded conversation. Shows author (human/agent) badges, severity badges, resolve button.

**Step 3: Write CommentWidget component**

The widget rendered by git-diff-view's widget API below diff lines. Shows existing comments for that line range and a "+" button to add new comments.

**Step 4: Integrate with DiffViewer**

Use git-diff-view's widget prop to render CommentWidget at lines with comments. Add click handler on line numbers to open CommentForm.

**Step 5: Verify comments work end-to-end**

Create a comment via the UI, verify it appears in the thread, verify it persists in the API.

**Step 6: Commit**

```bash
git add packages/frontend/src/components/
git commit -m "feat: add inline comment system with threading and severity levels"
```

---

### Task 18: Review Submission + Agent Status

**Files:**
- Create: `packages/frontend/src/components/ReviewBar.tsx`
- Create: `packages/frontend/src/components/AgentStatus.tsx`
- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Write ReviewBar component**

Bottom bar with "Approve" (green) and "Request Changes" (red) buttons. Shows comment count summary.

**Step 2: Write AgentStatus component**

Shows current agent state: working (spinner), idle, waiting for review. Updates via WebSocket.

**Step 3: Integrate into PRReview page**

**Step 4: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add review submission bar and agent status indicator"
```

---

## Phase 5: WebSocket + Real-time Updates

### Task 19: WebSocket Server

**Files:**
- Create: `packages/backend/src/ws.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/__tests__/ws.test.ts`

**Step 1: Write the WebSocket test**

Test that clients can connect and receive events when PR state changes.

**Step 2: Write the WebSocket module**

Register `@fastify/websocket`, create event emitter, broadcast events to connected clients.

**Step 3: Wire up event emission in routes**

Emit events when PRs are created, comments added, reviews submitted, agent signals ready.

**Step 4: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add WebSocket server for real-time PR events"
```

---

### Task 20: Frontend WebSocket Client

**Files:**
- Create: `packages/frontend/src/hooks/useWebSocket.ts`
- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Write useWebSocket hook**

Connects to backend WebSocket, exposes incoming events, auto-reconnects.

**Step 2: Integrate with PRReview page**

Auto-refresh comments and PR status when WebSocket events arrive.

**Step 3: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add WebSocket client for real-time updates in frontend"
```

---

## Phase 6: Agent Orchestrator

### Task 21: Agent Adapter Interface + Claude Code Adapter

**Files:**
- Create: `packages/backend/src/orchestrator/types.ts`
- Create: `packages/backend/src/orchestrator/claude-code-adapter.ts`
- Create: `packages/backend/src/orchestrator/prompt-builder.ts`
- Test: `packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`
- Test: `packages/backend/src/orchestrator/__tests__/claude-code-adapter.test.ts`

**Step 1: Write prompt builder test**

`packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../prompt-builder.js';

describe('PromptBuilder', () => {
  it('groups comments by file', () => {
    const prompt = buildReviewPrompt({
      prTitle: 'Add feature',
      agentContext: '{"summary": "Added auth"}',
      comments: [
        { filePath: 'src/auth.ts', startLine: 10, endLine: 10, body: 'Fix this', severity: 'must-fix', id: '1', thread: [] },
        { filePath: 'src/auth.ts', startLine: 20, endLine: 22, body: 'Consider refactoring', severity: 'suggestion', id: '2', thread: [] },
        { filePath: 'src/index.ts', startLine: 5, endLine: 5, body: 'Update import', severity: 'request', id: '3', thread: [] },
      ],
    });

    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('MUST FIX');
    expect(prompt).toContain('Fix this');
  });

  it('includes agent context', () => {
    const prompt = buildReviewPrompt({
      prTitle: 'PR',
      agentContext: '{"summary": "Built the auth system"}',
      comments: [],
    });
    expect(prompt).toContain('Built the auth system');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -w packages/backend`
Expected: FAIL

**Step 3: Write the prompt builder**

`packages/backend/src/orchestrator/prompt-builder.ts`:
```typescript
interface ReviewComment {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  severity: string;
  thread: Array<{ author: string; body: string }>;
}

interface PromptInput {
  prTitle: string;
  agentContext: string | null;
  comments: ReviewComment[];
  customPrompt?: string;
}

export function buildReviewPrompt(input: PromptInput): string {
  const { prTitle, agentContext, comments, customPrompt } = input;

  const sections: string[] = [];

  sections.push(`# Code Review Feedback for PR: ${prTitle}\n`);

  if (agentContext) {
    try {
      const ctx = JSON.parse(agentContext);
      sections.push(`## Context\n${JSON.stringify(ctx, null, 2)}\n`);
    } catch {
      sections.push(`## Context\n${agentContext}\n`);
    }
  }

  sections.push(`## Review Guidelines\n`);
  if (customPrompt) {
    sections.push(customPrompt);
  } else {
    sections.push(`- **MUST FIX** comments: Make the change. No discussion needed.
- **REQUEST** comments: Make the change unless you have a strong technical reason not to. If you disagree, explain why in a reply.
- **SUGGESTION** comments: Use your judgment. Fix if you agree, or reply with your reasoning if you disagree.

For each comment, either:
1. Make the code change and reply confirming what you changed
2. Reply explaining why you disagree (only for suggestion/request severity)

Use the shepherd CLI to submit your responses as a batch.`);
  }

  // Group comments by file
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath) || [];
    existing.push(c);
    byFile.set(c.filePath, existing);
  }

  sections.push(`\n## Comments\n`);
  for (const [filePath, fileComments] of byFile) {
    sections.push(`### ${filePath}\n`);
    for (const c of fileComments) {
      const sevLabel = c.severity === 'must-fix' ? 'MUST FIX' : c.severity.toUpperCase();
      const lineRange = c.startLine === c.endLine ? `L${c.startLine}` : `L${c.startLine}-${c.endLine}`;
      sections.push(`**[${sevLabel}]** ${lineRange} (comment ID: ${c.id})`);
      sections.push(`> ${c.body}\n`);

      if (c.thread.length > 0) {
        sections.push(`Thread:`);
        for (const reply of c.thread) {
          sections.push(`  - ${reply.author}: ${reply.body}`);
        }
        sections.push('');
      }
    }
  }

  return sections.join('\n');
}
```

**Step 4: Write the adapter types and Claude Code adapter**

`packages/backend/src/orchestrator/types.ts`:
```typescript
export interface AgentAdapter {
  name: string;
  startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession>;
  resumeSession(opts: { sessionId: string; projectPath: string; prompt: string }): Promise<AgentSession>;
}

export interface AgentSession {
  id: string;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  kill(): Promise<void>;
}
```

`packages/backend/src/orchestrator/claude-code-adapter.ts`:
```typescript
import { spawn, type ChildProcess } from 'child_process';
import type { AgentAdapter, AgentSession } from './types.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code';

  async startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--yes', '-p', opts.prompt], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return this.wrapProcess(proc);
  }

  async resumeSession(opts: { sessionId: string; projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--resume', opts.sessionId, '--yes', '-p', opts.prompt], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return this.wrapProcess(proc);
  }

  private wrapProcess(proc: ChildProcess): AgentSession {
    let completeCallback: (() => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;

    proc.on('exit', (code) => {
      if (code === 0) {
        completeCallback?.();
      } else {
        errorCallback?.(new Error(`Claude Code exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      errorCallback?.(err);
    });

    return {
      id: proc.pid?.toString() || 'unknown',
      onComplete(cb) { completeCallback = cb; },
      onError(cb) { errorCallback = cb; },
      async kill() { proc.kill('SIGTERM'); },
    };
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npm test -w packages/backend`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/orchestrator/
git commit -m "feat: add agent orchestrator with prompt builder and Claude Code adapter"
```

---

### Task 22: Orchestrator Integration with Review Route

**Files:**
- Create: `packages/backend/src/orchestrator/index.ts`
- Modify: `packages/backend/src/routes/pull-requests.ts`
- Modify: `packages/backend/src/server.ts`

**Step 1: Write the orchestrator service**

`packages/backend/src/orchestrator/index.ts` — coordinates fetching comments, building prompts, spawning agent sessions, and handling completion.

**Step 2: Integrate into review route**

When `action === 'request-changes'`, call the orchestrator to kick off the agent.

**Step 3: Test end-to-end manually**

Start backend, create project/PR via CLI, add comments, submit review with request-changes, verify agent process spawns.

**Step 4: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: integrate orchestrator with review route for agent kickoff"
```

---

## Phase 7: Configuration System

### Task 23: Config Service

**Files:**
- Create: `packages/backend/src/services/config.ts`
- Create: `packages/backend/src/routes/config.ts`
- Modify: `packages/backend/src/server.ts`
- Test: `packages/backend/src/services/__tests__/config.test.ts`

**Step 1: Write config service test**

Test the three-tier config resolution: global file → per-project file → DB overrides.

**Step 2: Write config service**

Reads `~/.shepherd/config.yml` (global), `.shepherd.yml` (per-project), and SQLite overrides. Merges them with correct precedence.

**Step 3: Write config routes**

GET/PUT for global and per-project config.

**Step 4: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add hierarchical config system with file and DB layers"
```

---

## Phase 8: Notifications

### Task 24: Notification Service

**Files:**
- Create: `packages/backend/src/services/notifications.ts`
- Modify: `packages/backend/src/orchestrator/index.ts`

**Step 1: Write notification service**

Uses `node-notifier` for OS notifications. Called when PR is ready for review.

**Step 2: Integrate into orchestrator**

When agent signals ready, send OS notification.

**Step 3: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add OS notification support for PR review readiness"
```

---

## Phase 9: Skills

### Task 25: Claude Code Skills

**Files:**
- Create: `skills/shepherd-submit-pr/skill.md`
- Create: `skills/shepherd-respond-to-review/skill.md`
- Create: `skills/shepherd-context-guidelines/skill.md`

**Step 1: Write shepherd:submit-pr skill**

Detailed instructions for agents on how to commit code, structure context, and use `shepherd submit`.

**Step 2: Write shepherd:respond-to-review skill**

Detailed instructions on interpreting severity levels, when to defend code, how to use `shepherd batch`, and how to signal ready.

**Step 3: Write shepherd:context-guidelines skill**

Template and guidance for what context to include when submitting PRs.

**Step 4: Commit**

```bash
git add skills/
git commit -m "feat: add Claude Code skills for PR submission and review response"
```

---

## Phase 10: Polish + Integration Testing

### Task 26: Frontend Theming

**Files:**
- Create: `packages/frontend/src/themes/`
- Modify: `packages/frontend/src/index.css`

**Step 1: Create light and dark theme CSS files**

Define CSS custom property values for each theme.

**Step 2: Add theme switcher to Settings page**

**Step 3: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add light/dark theme support with theme switcher"
```

---

### Task 27: Inter-Cycle Diff View

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx`
- Modify: `packages/backend/src/routes/diff.ts`

**Step 1: Add cycle selector to PR review page**

Dropdown to compare base→current (default) or previous-cycle→current.

**Step 2: Add backend endpoint for inter-cycle diff**

Store diff snapshots per cycle, serve diff between cycles.

**Step 3: Commit**

```bash
git add packages/
git commit -m "feat: add inter-cycle diff comparison view"
```

---

### Task 28: End-to-End Integration Test

**Files:**
- Create: `tests/e2e/full-workflow.test.ts`

**Step 1: Write an integration test**

Exercises the full workflow: register project → submit PR → add comments → request changes → (mock) agent responds → signal ready → approve.

**Step 2: Run and verify**

Run: `npx vitest run tests/e2e/`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/
git commit -m "test: add end-to-end integration test for full PR review workflow"
```

---

## Summary

| Phase | Tasks | What it delivers |
|---|---|---|
| 1: Foundation | 1-4 | Monorepo, deps, types, DB schema |
| 2: Backend API | 5-10 | REST API for projects, PRs, comments, diffs |
| 3: CLI | 11-12 | `shepherd` CLI with all commands |
| 4: Frontend | 13-18 | React app with diff viewer, comments, review |
| 5: WebSocket | 19-20 | Real-time updates |
| 6: Orchestrator | 21-22 | Agent management with Claude Code adapter |
| 7: Config | 23 | Hierarchical config system |
| 8: Notifications | 24 | OS + browser notifications |
| 9: Skills | 25 | Claude Code skill files |
| 10: Polish | 26-28 | Theming, inter-cycle diff, E2E tests |
