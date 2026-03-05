# Insights Analyzer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an automated workflow analyzer that runs alongside the code-fix agent, producing CLAUDE.md recommendations, skill suggestions, prompt engineering coaching, agent behavior observations, and recurring pattern alerts.

**Architecture:** Refactor the monolithic Orchestrator into a thin coordinator delegating to FeedbackIntegrator (code-fix) and InsightsAnalyzer (analysis), both sharing an AgentRunner for lifecycle management. Add a SessionLogProvider interface for discovering agent conversation transcripts. Add insights data model, CLI commands, API routes, and a frontend Insights tab.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM (SQLite), Commander.js (CLI), React 19, Tailwind CSS 4

---

### Task 1: Add `insights` table to database schema

**Files:**
- Modify: `packages/backend/src/db/schema.ts`
- Modify: `packages/shared/src/types.ts`

**Step 1: Add insights table to schema**

Add to `packages/backend/src/db/schema.ts` after the `projectConfig` table:

```typescript
export const insights = sqliteTable('insights', {
  id: text('id').primaryKey(),
  prId: text('pr_id').notNull().references(() => pullRequests.id),
  categories: text('categories').notNull().default('{}'),
  branchRef: text('branch_ref'),
  worktreePath: text('worktree_path'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});
```

**Step 2: Add shared types**

Add to `packages/shared/src/types.ts`:

```typescript
export interface InsightItem {
  title: string;
  description: string;
  applied?: boolean;
}

export interface RecurringPatternItem {
  title: string;
  description: string;
  prIds: string[];
}

export interface InsightCategories {
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}

export interface Insights {
  id: string;
  prId: string;
  categories: InsightCategories;
  branchRef: string | null;
  worktreePath: string | null;
  updatedAt: string;
}
```

**Step 3: Generate migration**

Run: `cd packages/backend && npx drizzle-kit generate --name add_insights_table`
Expected: New migration file in `packages/backend/drizzle/`

**Step 4: Verify migration applies**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: Tests still pass (migration auto-applies via `createDb`)

**Step 5: Commit**

```bash
git add packages/backend/src/db/schema.ts packages/shared/src/types.ts packages/backend/drizzle/
git commit -m "feat: add insights table schema and shared types"
```

---

### Task 2: Add insights API routes

**Files:**
- Create: `packages/backend/src/routes/insights.ts`
- Modify: `packages/backend/src/server.ts`

**Step 1: Write the test**

Create `packages/backend/src/routes/__tests__/insights.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Insights routes', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = proj.json().id;

    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET returns null when no insights exist', async () => {
    const res = await inject({ method: 'GET', url: `/api/prs/${prId}/insights` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });

  it('PUT creates insights on first call (upsert)', async () => {
    const categories = {
      claudeMdRecommendations: [{ title: 'Add test conventions', description: 'Specify vitest', applied: false }],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const res = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories, branchRef: 'shepherd/insights/abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.prId).toBe(prId);
    expect(body.categories.claudeMdRecommendations).toHaveLength(1);
    expect(body.branchRef).toBe('shepherd/insights/abc');
  });

  it('PUT updates existing insights (upsert)', async () => {
    // Create first
    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: { claudeMdRecommendations: [], skillRecommendations: [], promptEngineering: [], agentBehaviorObservations: [], recurringPatterns: [] } },
    });

    // Update
    const updated = {
      claudeMdRecommendations: [{ title: 'New rule', description: 'Details', applied: false }],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };
    const res = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: updated },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().categories.claudeMdRecommendations).toHaveLength(1);
  });

  it('GET returns insights after creation', async () => {
    const categories = {
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [{ title: 'Be more specific', description: 'Details' }],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };
    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });

    const res = await inject({ method: 'GET', url: `/api/prs/${prId}/insights` });
    expect(res.statusCode).toBe(200);
    expect(res.json().categories.promptEngineering).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: FAIL — route not registered

**Step 3: Create the insights route**

Create `packages/backend/src/routes/insights.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { schema } from '../db/index.js';

export async function insightsRoutes(fastify: FastifyInstance) {
  const db = (fastify as any).db;

  // GET /api/prs/:prId/insights
  fastify.get('/api/prs/:prId/insights', async (request) => {
    const { prId } = request.params as { prId: string };
    const row = db.select().from(schema.insights)
      .where(eq(schema.insights.prId, prId)).get();
    if (!row) return null;
    return { ...row, categories: JSON.parse(row.categories) };
  });

  // PUT /api/prs/:prId/insights (upsert)
  fastify.put('/api/prs/:prId/insights', async (request) => {
    const { prId } = request.params as { prId: string };
    const { categories, branchRef, worktreePath } = request.body as {
      categories: Record<string, unknown>;
      branchRef?: string;
      worktreePath?: string;
    };

    const now = new Date().toISOString();
    const existing = db.select().from(schema.insights)
      .where(eq(schema.insights.prId, prId)).get();

    if (existing) {
      db.update(schema.insights)
        .set({
          categories: JSON.stringify(categories),
          ...(branchRef !== undefined ? { branchRef } : {}),
          ...(worktreePath !== undefined ? { worktreePath } : {}),
          updatedAt: now,
        })
        .where(eq(schema.insights.id, existing.id))
        .run();
    } else {
      db.insert(schema.insights)
        .values({
          id: randomUUID(),
          prId,
          categories: JSON.stringify(categories),
          branchRef: branchRef ?? null,
          worktreePath: worktreePath ?? null,
          updatedAt: now,
        })
        .run();
    }

    const row = db.select().from(schema.insights)
      .where(eq(schema.insights.prId, prId)).get();
    return { ...row, categories: JSON.parse(row.categories) };
  });
}
```

**Step 4: Register route in server**

Add to `packages/backend/src/server.ts`:

```typescript
import { insightsRoutes } from './routes/insights.js';
// ... after the existing route registrations:
await fastify.register(insightsRoutes);
```

**Step 5: Run tests to verify they pass**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/routes/insights.ts packages/backend/src/routes/__tests__/insights.test.ts packages/backend/src/server.ts
git commit -m "feat: add insights API routes with upsert semantics"
```

---

### Task 3: Add comment history API route

**Files:**
- Modify: `packages/backend/src/routes/comments.ts`

**Step 1: Write the test**

Add to `packages/backend/src/routes/__tests__/insights.test.ts` (or create a separate test file):

```typescript
describe('Comment history route', () => {
  // uses same beforeEach/afterEach as above

  it('GET /api/projects/:id/comments/history returns all comments across PRs', async () => {
    // Create a second PR
    const pr2 = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR 2', description: '', sourceBranch: 'feat/y' },
    });
    const prId2 = pr2.json().id;

    // Add comments to both PRs
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { body: 'Comment on PR 1', severity: 'request', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId2}/comments`,
      payload: { body: 'Comment on PR 2', severity: 'must-fix', author: 'human' },
    });

    const res = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(res.statusCode).toBe(200);
    const comments = res.json();
    expect(comments.length).toBeGreaterThanOrEqual(2);
    expect(comments.some((c: any) => c.body === 'Comment on PR 1')).toBe(true);
    expect(comments.some((c: any) => c.body === 'Comment on PR 2')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: FAIL — route not found

**Step 3: Add the route**

Add to `packages/backend/src/routes/comments.ts` (or a new file — wherever feels cleanest). This requires joining through PRs to get all comments for a project:

```typescript
// GET /api/projects/:projectId/comments/history
fastify.get('/api/projects/:projectId/comments/history', async (request) => {
  const { projectId } = request.params as { projectId: string };

  // Get all PRs for this project
  const prs = db.select().from(schema.pullRequests)
    .where(eq(schema.pullRequests.projectId, projectId)).all();
  const prIds = prs.map((p: any) => p.id);
  if (prIds.length === 0) return [];

  // Get all cycles for these PRs
  const cycles = db.select().from(schema.reviewCycles)
    .where(inArray(schema.reviewCycles.prId, prIds)).all();
  const cycleIds = cycles.map((c: any) => c.id);
  if (cycleIds.length === 0) return [];

  // Get all comments
  const comments = db.select().from(schema.comments)
    .where(inArray(schema.comments.reviewCycleId, cycleIds)).all();

  // Enrich with prId by mapping cycleId -> prId
  const cycleToPr = new Map(cycles.map((c: any) => [c.id, c.prId]));
  return comments.map((c: any) => ({
    ...c,
    prId: cycleToPr.get(c.reviewCycleId) ?? null,
  }));
});
```

**Step 4: Run tests**

Run: `npm run test --workspace=packages/backend -- --run src/routes/__tests__/insights.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/backend/src/routes/comments.ts packages/backend/src/routes/__tests__/insights.test.ts
git commit -m "feat: add cross-PR comment history API route"
```

---

### Task 4: Add insights CLI commands

**Files:**
- Create: `packages/cli/src/commands/insights.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Create the insights CLI command file**

Create `packages/cli/src/commands/insights.ts`:

```typescript
import { Command } from 'commander';
import { ApiClient } from '../api-client.js';

export function insightsCommand(program: Command, client: ApiClient) {
  const insights = program
    .command('insights')
    .description('Workflow insights tools');

  insights
    .command('get <pr-id>')
    .description('Get current insights for a PR')
    .action(async (prId: string) => {
      const result = await client.get<any>(`/api/prs/${prId}/insights`);
      if (!result) {
        console.log('No insights found for this PR.');
        return;
      }
      console.log(JSON.stringify(result.categories, null, 2));
    });

  insights
    .command('update <pr-id>')
    .description('Update insights for a PR')
    .option('--stdin', 'Read insights JSON from stdin')
    .action(async (prId: string, opts: { stdin?: boolean }) => {
      if (!opts.stdin) {
        console.error('Must specify --stdin');
        process.exit(1);
      }

      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
      const result = await client.put<any>(`/api/prs/${prId}/insights`, payload);
      console.log(`Insights updated for PR ${prId} (${Object.keys(result.categories).length} categories)`);
    });

  insights
    .command('history <project-id>')
    .description('Get all comments across PRs for a project')
    .action(async (projectId: string) => {
      const comments = await client.get<any[]>(`/api/projects/${projectId}/comments/history`);
      console.log(JSON.stringify(comments, null, 2));
    });
}
```

**Step 2: Register in CLI entry point**

Add to `packages/cli/src/index.ts`:

```typescript
import { insightsCommand } from './commands/insights.js';
// ... after existing command registrations:
insightsCommand(program, client);
```

**Step 3: Build and verify**

Run: `npm run build --workspace=packages/cli`
Expected: Builds without errors

**Step 4: Commit**

```bash
git add packages/cli/src/commands/insights.ts packages/cli/src/index.ts
git commit -m "feat: add shepherd insights CLI commands (get, update, history)"
```

---

### Task 5: Extract AgentRunner from Orchestrator

**Files:**
- Create: `packages/backend/src/orchestrator/agent-runner.ts`
- Modify: `packages/backend/src/orchestrator/types.ts`

**Step 1: Write the test**

Create `packages/backend/src/orchestrator/__tests__/agent-runner.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { AgentRunner } from '../agent-runner.js';
import type { AgentAdapter, AgentSession, AgentActivityEntry } from '../types.js';

function createMockAdapter(session: Partial<AgentSession> = {}): AgentAdapter {
  const mockSession: AgentSession = {
    id: 'test-session',
    onComplete: vi.fn((cb) => { (mockSession as any)._completeCb = cb; }),
    onError: vi.fn((cb) => { (mockSession as any)._errorCb = cb; }),
    onOutput: vi.fn((cb) => { (mockSession as any)._outputCb = cb; }),
    kill: vi.fn(async () => {}),
    ...session,
  };
  return {
    name: 'test',
    startSession: vi.fn(async () => mockSession),
  };
}

describe('AgentRunner', () => {
  it('spawns agent and tracks session', async () => {
    const adapter = createMockAdapter();
    const broadcast = vi.fn();
    const runner = new AgentRunner({ adapter, broadcast });

    const onComplete = vi.fn();
    const onError = vi.fn();

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp/test', prompt: 'test', source: 'code-fix' },
      { onComplete, onError },
    );

    expect(adapter.startSession).toHaveBeenCalledWith({ projectPath: '/tmp/test', prompt: 'test' });
    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);
  });

  it('supports two sessions for same PR with different sources', async () => {
    const adapter = createMockAdapter();
    const runner = new AgentRunner({ adapter, broadcast: vi.fn() });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp/test', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );
    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp/test2', prompt: 'analyze', source: 'insights' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);
    expect(runner.hasActiveSession('pr-1', 'insights')).toBe(true);
  });

  it('broadcasts output with source field', async () => {
    const adapter = createMockAdapter();
    const broadcast = vi.fn();
    const runner = new AgentRunner({ adapter, broadcast });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp/test', prompt: 'test', source: 'insights' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    // Simulate output
    const session = await adapter.startSession({ projectPath: '', prompt: '' });
    const outputCb = (session.onOutput as any).mock.calls[0][0];
    const entry: AgentActivityEntry = { timestamp: 'now', type: 'text', summary: 'hello' };
    outputCb(entry);

    expect(broadcast).toHaveBeenCalledWith('agent:output', { prId: 'pr-1', source: 'insights', entry });
  });

  it('cancel kills session and removes from tracking', async () => {
    const adapter = createMockAdapter();
    const runner = new AgentRunner({ adapter, broadcast: vi.fn() });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp/test', prompt: 'test', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    await runner.cancel('pr-1', 'code-fix');
    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/__tests__/agent-runner.test.ts`
Expected: FAIL — module not found

**Step 3: Add AgentRunConfig to types**

Add to `packages/backend/src/orchestrator/types.ts`:

```typescript
export type AgentSource = 'code-fix' | 'insights';

export interface AgentRunConfig {
  prId: string;
  projectPath: string;
  prompt: string;
  source: AgentSource;
}

export interface AgentRunCallbacks {
  onComplete: () => void;
  onError: (error: Error) => void;
}
```

**Step 4: Create AgentRunner**

Create `packages/backend/src/orchestrator/agent-runner.ts`:

```typescript
import { existsSync } from 'fs';
import type { AgentAdapter, AgentSession, AgentRunConfig, AgentRunCallbacks, AgentSource } from './types.js';

interface AgentRunnerDeps {
  adapter: AgentAdapter;
  broadcast: (event: string, data: any) => void;
}

export class AgentRunner {
  private adapter: AgentAdapter;
  private broadcast: (event: string, data: any) => void;
  private activeSessions = new Map<string, AgentSession>();

  constructor(deps: AgentRunnerDeps) {
    this.adapter = deps.adapter;
    this.broadcast = deps.broadcast;
  }

  private sessionKey(prId: string, source: AgentSource): string {
    return `${prId}:${source}`;
  }

  hasActiveSession(prId: string, source: AgentSource): boolean {
    return this.activeSessions.has(this.sessionKey(prId, source));
  }

  async run(config: AgentRunConfig, callbacks: AgentRunCallbacks): Promise<void> {
    const { prId, projectPath, prompt, source } = config;
    const key = this.sessionKey(prId, source);

    if (!existsSync(projectPath)) {
      throw new Error(
        `Working directory does not exist: ${projectPath}\n` +
        'The worktree may have been removed. Recreate it and try again.'
      );
    }

    const session = await this.adapter.startSession({ projectPath, prompt });
    this.activeSessions.set(key, session);

    this.broadcast('agent:working', { prId, source });

    session.onOutput((entry) => {
      this.broadcast('agent:output', { prId, source, entry });
    });

    session.onComplete(() => {
      this.activeSessions.delete(key);
      this.broadcast('agent:completed', { prId, source });
      callbacks.onComplete();
    });

    session.onError((error) => {
      this.activeSessions.delete(key);
      this.broadcast('agent:error', { prId, source, error: error.message });
      callbacks.onError(error);
    });
  }

  async cancel(prId: string, source: AgentSource): Promise<void> {
    const key = this.sessionKey(prId, source);
    const session = this.activeSessions.get(key);
    if (session) {
      await session.kill();
      this.activeSessions.delete(key);
    }
    this.broadcast('agent:cancelled', { prId, source });
  }
}
```

**Step 5: Run tests**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/__tests__/agent-runner.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/orchestrator/agent-runner.ts packages/backend/src/orchestrator/types.ts packages/backend/src/orchestrator/__tests__/agent-runner.test.ts
git commit -m "feat: extract AgentRunner with source-keyed session tracking"
```

---

### Task 6: Extract FeedbackIntegrator from Orchestrator

**Files:**
- Create: `packages/backend/src/orchestrator/review/feedback-integrator.ts`
- Move: `packages/backend/src/orchestrator/prompt-builder.ts` → `packages/backend/src/orchestrator/review/prompt-builder.ts`
- Move: `packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts` → `packages/backend/src/orchestrator/review/__tests__/prompt-builder.test.ts`

**Step 1: Create review directory and move prompt builder**

```bash
mkdir -p packages/backend/src/orchestrator/review/__tests__
git mv packages/backend/src/orchestrator/prompt-builder.ts packages/backend/src/orchestrator/review/prompt-builder.ts
git mv packages/backend/src/orchestrator/__tests__/prompt-builder.test.ts packages/backend/src/orchestrator/review/__tests__/prompt-builder.test.ts
```

Update the import path in the moved test file from `'../prompt-builder.js'` to `'../prompt-builder.js'` (same relative path since both moved together).

**Step 2: Create FeedbackIntegrator**

Create `packages/backend/src/orchestrator/review/feedback-integrator.ts`:

```typescript
import { eq, inArray } from 'drizzle-orm';
import { AgentRunner } from '../agent-runner.js';
import { buildReviewPrompt } from './prompt-builder.js';
import { getLatestCycle } from '../../db/queries.js';
import { NotificationService } from '../../services/notifications.js';

interface FeedbackIntegratorDeps {
  db: any;
  schema: any;
  agentRunner: AgentRunner;
  notificationService: NotificationService;
}

export class FeedbackIntegrator {
  private db: any;
  private schema: any;
  private agentRunner: AgentRunner;
  private notificationService: NotificationService;

  constructor(deps: FeedbackIntegratorDeps) {
    this.db = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.notificationService = deps.notificationService;
  }

  private getLatestCycle(prId: string) {
    return getLatestCycle(this.db, prId);
  }

  private setCycleStatus(cycleId: string, status: string) {
    this.db.update(this.schema.reviewCycles)
      .set({ status })
      .where(eq(this.schema.reviewCycles.id, cycleId))
      .run();
  }

  async run(prId: string): Promise<void> {
    const pr = this.db.select().from(this.schema.pullRequests)
      .where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects)
      .where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    const currentCycle = this.getLatestCycle(prId);
    if (!currentCycle) throw new Error(`No review cycle found for PR: ${prId}`);

    // Build comment summary
    const allCycles = this.db.select().from(this.schema.reviewCycles)
      .where(eq(this.schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    const allComments = this.db.select().from(this.schema.comments)
      .where(inArray(this.schema.comments.reviewCycleId, cycleIds)).all();

    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
    let generalCount = 0;

    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      if (!c.filePath) {
        generalCount++;
      } else {
        const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
        fileMap.set(c.filePath, entry);
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: pr.title,
      agentContext: pr.agentContext,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
        generalCount,
      },
    });

    this.setCycleStatus(currentCycle.id, 'agent_working');

    const effectivePath = pr.workingDirectory ?? project.path;

    try {
      await this.agentRunner.run(
        { prId, projectPath: effectivePath, prompt, source: 'code-fix' },
        {
          onComplete: () => {
            const latestCycle = this.getLatestCycle(prId);
            if (latestCycle && latestCycle.status === 'agent_working') {
              this.setCycleStatus(latestCycle.id, 'agent_completed');
            }
            this.notificationService.notifyPRReadyForReview(pr.title, project.name);
          },
          onError: (error) => {
            this.setCycleStatus(currentCycle.id, 'agent_error');
          },
        },
      );
    } catch (error) {
      this.setCycleStatus(currentCycle.id, 'agent_error');
      throw error;
    }
  }
}
```

**Step 3: Verify existing tests still pass**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: PASS (prompt-builder tests work from new location, orchestrator tests still pass)

**Step 4: Commit**

```bash
git add packages/backend/src/orchestrator/review/
git commit -m "feat: extract FeedbackIntegrator from Orchestrator"
```

---

### Task 7: Create SessionLogProvider interface and Claude Code implementation

**Files:**
- Create: `packages/backend/src/orchestrator/session-log/provider.ts`
- Create: `packages/backend/src/orchestrator/session-log/claude-code-provider.ts`
- Create: `packages/backend/src/orchestrator/session-log/__tests__/claude-code-provider.test.ts`

**Step 1: Create the interface**

Create `packages/backend/src/orchestrator/session-log/provider.ts`:

```typescript
export interface SessionLog {
  sessionId: string;
  filePath: string;
  startedAt: string;
  branch: string;
}

export interface SessionLogProvider {
  name: string;
  findSessions(opts: {
    projectPath: string;
    branch: string;
  }): Promise<SessionLog[]>;
}
```

**Step 2: Write the test**

Create `packages/backend/src/orchestrator/session-log/__tests__/claude-code-provider.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ClaudeCodeSessionLogProvider } from '../claude-code-provider.js';

describe('ClaudeCodeSessionLogProvider', () => {
  let tempDir: string;
  let projectsDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `claude-test-${Date.now()}`);
    projectsDir = join(tempDir, '.claude', 'projects');
    mkdirSync(projectsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('finds sessions matching the branch', async () => {
    const projectKey = '-tmp-myproject';
    const sessionsDir = join(projectsDir, projectKey);
    mkdirSync(sessionsDir, { recursive: true });

    // Session on matching branch
    const session1 = [
      JSON.stringify({ type: 'system', sessionId: 'sess-1', gitBranch: 'feat/x' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' }, sessionId: 'sess-1', gitBranch: 'feat/x' }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'sess-1.jsonl'), session1);

    // Session on different branch
    const session2 = [
      JSON.stringify({ type: 'system', sessionId: 'sess-2', gitBranch: 'feat/y' }),
    ].join('\n');
    writeFileSync(join(sessionsDir, 'sess-2.jsonl'), session2);

    const provider = new ClaudeCodeSessionLogProvider(tempDir);
    const results = await provider.findSessions({ projectPath: '/tmp/myproject', branch: 'feat/x' });

    expect(results).toHaveLength(1);
    expect(results[0].sessionId).toBe('sess-1');
    expect(results[0].branch).toBe('feat/x');
  });

  it('returns empty array when no sessions match', async () => {
    const projectKey = '-tmp-myproject';
    const sessionsDir = join(projectsDir, projectKey);
    mkdirSync(sessionsDir, { recursive: true });

    const provider = new ClaudeCodeSessionLogProvider(tempDir);
    const results = await provider.findSessions({ projectPath: '/tmp/myproject', branch: 'feat/z' });
    expect(results).toHaveLength(0);
  });

  it('returns empty array when project directory does not exist', async () => {
    const provider = new ClaudeCodeSessionLogProvider(tempDir);
    const results = await provider.findSessions({ projectPath: '/nonexistent/path', branch: 'main' });
    expect(results).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/session-log/__tests__/claude-code-provider.test.ts`
Expected: FAIL — module not found

**Step 4: Implement ClaudeCodeSessionLogProvider**

Create `packages/backend/src/orchestrator/session-log/claude-code-provider.ts`:

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { SessionLogProvider, SessionLog } from './provider.js';

export class ClaudeCodeSessionLogProvider implements SessionLogProvider {
  name = 'claude-code';
  private homeDir: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? process.env.HOME ?? '';
  }

  private projectDirKey(projectPath: string): string {
    // Claude Code mangles project paths: /Users/foo/myproject -> -Users-foo-myproject
    return projectPath.replace(/\//g, '-');
  }

  async findSessions(opts: { projectPath: string; branch: string }): Promise<SessionLog[]> {
    const projectKey = this.projectDirKey(opts.projectPath);
    const sessionsDir = join(this.homeDir, '.claude', 'projects', projectKey);

    if (!existsSync(sessionsDir)) return [];

    const files = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'));
    const results: SessionLog[] = [];

    for (const file of files) {
      const filePath = join(sessionsDir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        // Scan first ~20 lines for session metadata
        let sessionId: string | null = null;
        let branch: string | null = null;
        let startedAt: string | null = null;

        for (const line of lines.slice(0, 20)) {
          try {
            const msg = JSON.parse(line);
            if (msg.sessionId && !sessionId) sessionId = msg.sessionId;
            if (msg.gitBranch && !branch) branch = msg.gitBranch;
            if (msg.type === 'user' && !startedAt) {
              startedAt = msg.timestamp ?? statSync(filePath).mtime.toISOString();
            }
            if (sessionId && branch) break;
          } catch {
            continue;
          }
        }

        if (branch === opts.branch && sessionId) {
          results.push({
            sessionId,
            filePath,
            startedAt: startedAt ?? statSync(filePath).mtime.toISOString(),
            branch,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by most recent first
    results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return results;
  }
}
```

**Step 5: Run tests**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/session-log/__tests__/claude-code-provider.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/orchestrator/session-log/
git commit -m "feat: add SessionLogProvider interface with Claude Code implementation"
```

---

### Task 8: Create InsightsAnalyzer module

**Files:**
- Create: `packages/backend/src/orchestrator/insights/insights-analyzer.ts`
- Create: `packages/backend/src/orchestrator/insights/prompt-builder.ts`
- Create: `packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`
- Create: `packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`

**Step 1: Write the insights prompt builder test**

Create `packages/backend/src/orchestrator/insights/__tests__/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildInsightsPrompt } from '../prompt-builder.js';

describe('Insights PromptBuilder', () => {
  it('includes PR info', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'Add auth feature',
      branch: 'feat/auth',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('pr-123');
    expect(prompt).toContain('Add auth feature');
    expect(prompt).toContain('feat/auth');
  });

  it('includes session log paths', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: ['/home/user/.claude/projects/x/sess-1.jsonl', '/home/user/.claude/projects/x/sess-2.jsonl'],
    });
    expect(prompt).toContain('sess-1.jsonl');
    expect(prompt).toContain('sess-2.jsonl');
  });

  it('includes CLI command references', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('shepherd insights get');
    expect(prompt).toContain('shepherd insights update');
    expect(prompt).toContain('shepherd insights history');
  });

  it('handles empty session logs gracefully', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('No session logs');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: FAIL — module not found

**Step 3: Create insights prompt builder**

Create `packages/backend/src/orchestrator/insights/prompt-builder.ts`:

```typescript
interface InsightsPromptInput {
  prId: string;
  prTitle: string;
  branch: string;
  projectId: string;
  sessionLogPaths: string[];
}

export function buildInsightsPrompt(input: InsightsPromptInput): string {
  const { prId, prTitle, branch, projectId, sessionLogPaths } = input;
  const sections: string[] = [];

  sections.push(`# Workflow Insights Analysis for PR: ${prTitle}\n`);

  sections.push(`## PR Details

- PR ID: ${prId}
- Branch: ${branch}
- Project ID: ${projectId}
`);

  if (sessionLogPaths.length > 0) {
    sections.push(`## Session Logs

The following session transcript files are available for analysis. Read them to understand what the agent did and why.

${sessionLogPaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}
`);
  } else {
    sections.push(`## Session Logs

No session logs found for this branch. Focus analysis on the comment history.
`);
  }

  sections.push(`## Available CLI Commands

- \`shepherd insights get ${prId}\` — Read current insights (call this first to work additively)
- \`shepherd insights update ${prId} --stdin\` — Save/update your insights
- \`shepherd insights history ${projectId}\` — Get all comments across PRs for pattern detection

## Your Task

Analyze the agent's session transcripts and the project's comment history to produce workflow improvement recommendations. Use the analyzer skill for detailed methodology.

### Output Format

Submit your findings via:
\`\`\`bash
echo '<json>' | shepherd insights update ${prId} --stdin
\`\`\`

The JSON payload must have this structure:
\`\`\`json
{
  "categories": {
    "claudeMdRecommendations": [{"title": "...", "description": "...", "applied": false}],
    "skillRecommendations": [{"title": "...", "description": "...", "applied": false}],
    "promptEngineering": [{"title": "...", "description": "..."}],
    "agentBehaviorObservations": [{"title": "...", "description": "..."}],
    "recurringPatterns": [{"title": "...", "description": "...", "prIds": ["..."]}]
  }
}
\`\`\`

### Workflow

1. Call \`shepherd insights get ${prId}\` to check for existing insights
2. Call \`shepherd insights history ${projectId}\` to get cross-PR comment patterns
3. Read the session log files listed above
4. Analyze the session transcripts, correlating with review comments
5. For CLAUDE.md and skill recommendations, also make the file changes and commit them
6. Submit all insights via the update command
`);

  return sections.join('\n');
}
```

**Step 4: Run prompt builder tests**

Run: `npm run test --workspace=packages/backend -- --run src/orchestrator/insights/__tests__/prompt-builder.test.ts`
Expected: PASS

**Step 5: Write InsightsAnalyzer test**

Create `packages/backend/src/orchestrator/insights/__tests__/insights-analyzer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { InsightsAnalyzer } from '../insights-analyzer.js';
import type { AgentRunner } from '../../agent-runner.js';
import type { SessionLogProvider } from '../../session-log/provider.js';

function createMockRunner(): AgentRunner {
  return {
    run: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    hasActiveSession: vi.fn(() => false),
  } as any;
}

function createMockSessionLogProvider(sessions: any[] = []): SessionLogProvider {
  return {
    name: 'mock',
    findSessions: vi.fn(async () => sessions),
  };
}

function createMockDb() {
  const pr = { id: 'pr-1', projectId: 'proj-1', title: 'Test PR', sourceBranch: 'feat/x', workingDirectory: '/tmp/worktree' };
  const project = { id: 'proj-1', path: '/tmp/project', name: 'Test' };

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn((table: any) => {
            // Return pr or project based on context
            return pr;
          }),
        })),
      })),
    })),
    _pr: pr,
    _project: project,
  };
}

describe('InsightsAnalyzer', () => {
  it('discovers session logs and spawns agent', async () => {
    const runner = createMockRunner();
    const sessionLogProvider = createMockSessionLogProvider([
      { sessionId: 's1', filePath: '/path/to/s1.jsonl', startedAt: '2026-01-01', branch: 'feat/x' },
    ]);

    const db = createMockDb();
    // Override to return correct data
    let callCount = 0;
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => {
            callCount++;
            return callCount === 1 ? db._pr : db._project;
          }),
        })),
      })),
    }));

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(sessionLogProvider.findSessions).toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });
});
```

**Step 6: Create InsightsAnalyzer**

Create `packages/backend/src/orchestrator/insights/insights-analyzer.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { AgentRunner } from '../agent-runner.js';
import type { SessionLogProvider } from '../session-log/provider.js';
import { buildInsightsPrompt } from './prompt-builder.js';

interface InsightsAnalyzerDeps {
  db: any;
  schema: any;
  agentRunner: AgentRunner;
  sessionLogProvider: SessionLogProvider;
}

export class InsightsAnalyzer {
  private db: any;
  private schema: any;
  private agentRunner: AgentRunner;
  private sessionLogProvider: SessionLogProvider;

  constructor(deps: InsightsAnalyzerDeps) {
    this.db = deps.db;
    this.schema = deps.schema;
    this.agentRunner = deps.agentRunner;
    this.sessionLogProvider = deps.sessionLogProvider;
  }

  async run(prId: string): Promise<void> {
    const pr = this.db.select().from(this.schema.pullRequests)
      .where(eq(this.schema.pullRequests.id, prId)).get();
    if (!pr) throw new Error(`PR not found: ${prId}`);

    const project = this.db.select().from(this.schema.projects)
      .where(eq(this.schema.projects.id, pr.projectId)).get();
    if (!project) throw new Error(`Project not found: ${pr.projectId}`);

    // Discover session logs for this branch
    const sessions = await this.sessionLogProvider.findSessions({
      projectPath: project.path,
      branch: pr.sourceBranch,
    });

    // Build prompt
    const prompt = buildInsightsPrompt({
      prId,
      prTitle: pr.title,
      branch: pr.sourceBranch,
      projectId: pr.projectId,
      sessionLogPaths: sessions.map(s => s.filePath),
    });

    // TODO: Create worktree branched off PR branch for file changes
    // For now, use the PR's working directory
    const effectivePath = pr.workingDirectory ?? project.path;

    await this.agentRunner.run(
      { prId, projectPath: effectivePath, prompt, source: 'insights' },
      {
        onComplete: () => {
          // Insights completion is non-critical — no cycle status to update
        },
        onError: (error) => {
          // Log but don't fail the overall flow
          console.error(`Insights analyzer error for PR ${prId}:`, error.message);
        },
      },
    );
  }
}
```

**Step 7: Run all tests**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/backend/src/orchestrator/insights/
git commit -m "feat: add InsightsAnalyzer module with prompt builder"
```

---

### Task 9: Refactor Orchestrator to thin coordinator

**Files:**
- Modify: `packages/backend/src/orchestrator/index.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts`

**Step 1: Rewrite Orchestrator as thin coordinator**

Rewrite `packages/backend/src/orchestrator/index.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { AgentAdapter, AgentSource } from './types.js';
import { ClaudeCodeAdapter } from './claude-code-adapter.js';
import { AgentRunner } from './agent-runner.js';
import { FeedbackIntegrator } from './review/feedback-integrator.js';
import { InsightsAnalyzer } from './insights/insights-analyzer.js';
import { ClaudeCodeSessionLogProvider } from './session-log/claude-code-provider.js';
import { NotificationService } from '../services/notifications.js';
import type { SessionLogProvider } from './session-log/provider.js';

export { AgentRunner } from './agent-runner.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export { FeedbackIntegrator } from './review/feedback-integrator.js';
export { InsightsAnalyzer } from './insights/insights-analyzer.js';
export type { AgentAdapter, AgentSession, AgentSource } from './types.js';
export { buildReviewPrompt } from './review/prompt-builder.js';

interface OrchestratorDeps {
  db: any;
  schema: any;
  broadcast?: (event: string, data: any) => void;
  adapter?: AgentAdapter;
  sessionLogProvider?: SessionLogProvider;
  notificationService?: NotificationService;
  devMode?: boolean;
}

export class Orchestrator {
  private feedbackIntegrator: FeedbackIntegrator;
  private insightsAnalyzer: InsightsAnalyzer;
  private agentRunner: AgentRunner;

  constructor(deps: OrchestratorDeps) {
    const adapter = deps.adapter || new ClaudeCodeAdapter({ devMode: deps.devMode });
    const broadcast = deps.broadcast || (() => {});
    const notificationService = deps.notificationService || new NotificationService();
    const sessionLogProvider = deps.sessionLogProvider || new ClaudeCodeSessionLogProvider();

    this.agentRunner = new AgentRunner({ adapter, broadcast });

    this.feedbackIntegrator = new FeedbackIntegrator({
      db: deps.db,
      schema: deps.schema,
      agentRunner: this.agentRunner,
      notificationService,
    });

    this.insightsAnalyzer = new InsightsAnalyzer({
      db: deps.db,
      schema: deps.schema,
      agentRunner: this.agentRunner,
      sessionLogProvider,
    });
  }

  async handleRequestChanges(prId: string): Promise<void> {
    // Run both in parallel — insights errors don't block code-fix
    const codeFixPromise = this.feedbackIntegrator.run(prId);
    const insightsPromise = this.insightsAnalyzer.run(prId).catch((err) => {
      console.error(`Insights analysis failed for PR ${prId}:`, err.message);
    });

    await Promise.all([codeFixPromise, insightsPromise]);
  }

  async runInsights(prId: string): Promise<void> {
    await this.insightsAnalyzer.run(prId);
  }

  async cancelAgent(prId: string, source?: AgentSource): Promise<void> {
    if (source) {
      await this.agentRunner.cancel(prId, source);
    } else {
      // Cancel both if no source specified
      await this.agentRunner.cancel(prId, 'code-fix');
      await this.agentRunner.cancel(prId, 'insights');
    }
  }
}
```

**Step 2: Update orchestrator test**

The existing orchestrator test at `packages/backend/src/orchestrator/__tests__/orchestrator.test.ts` imports `buildReviewPrompt` from `'../index.js'` — update this import to still work. The test should continue to pass since `buildReviewPrompt` is re-exported.

**Step 3: Add run-insights route**

Add to `packages/backend/src/routes/pull-requests.ts`:

```typescript
// POST /api/prs/:id/run-insights
fastify.post('/api/prs/:id/run-insights', async (request, reply) => {
  const { id } = request.params as { id: string };

  const pr = db.select().from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id)).get();
  if (!pr) {
    reply.code(404).send({ error: 'Pull request not found' });
    return;
  }

  const orchestrator = (fastify as any).orchestrator;
  if (orchestrator) {
    orchestrator.runInsights(id).catch((err: Error) => {
      fastify.log.error({ err, prId: id }, 'Insights analysis failed');
    });
  }

  return { status: 'insights_started' };
});
```

**Step 4: Update cancel-agent route to support source param**

Update the existing cancel-agent route in `packages/backend/src/routes/pull-requests.ts` to accept an optional `source` query param:

```typescript
fastify.post('/api/prs/:id/cancel-agent', async (request, reply) => {
  const { id } = request.params as { id: string };
  const { source } = request.query as { source?: string };

  const pr = db.select().from(schema.pullRequests)
    .where(eq(schema.pullRequests.id, id)).get();
  if (!pr) {
    reply.code(404).send({ error: 'Pull request not found' });
    return;
  }

  const orchestrator = (fastify as any).orchestrator;
  if (orchestrator) {
    await orchestrator.cancelAgent(id, source as any);
  }

  return { status: 'cancelled' };
});
```

**Step 5: Run all tests**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/backend/src/orchestrator/index.ts packages/backend/src/orchestrator/__tests__/ packages/backend/src/routes/pull-requests.ts packages/backend/src/server.ts
git commit -m "refactor: Orchestrator as thin coordinator delegating to FeedbackIntegrator + InsightsAnalyzer"
```

---

### Task 10: Add frontend API methods for insights

**Files:**
- Modify: `packages/frontend/src/api.ts`

**Step 1: Add insights methods to API client**

Add to `packages/frontend/src/api.ts` inside the `api` object:

```typescript
insights: {
  get: (prId: string) => request<any | null>(`/prs/${prId}/insights`),
  runAnalyzer: (prId: string) => request<any>(`/prs/${prId}/run-insights`, { method: 'POST' }),
},
```

Also update `prs.cancelAgent` to accept an optional source:

```typescript
cancelAgent: (id: string, source?: string) => {
  const params = source ? `?source=${source}` : '';
  return request<any>(`/prs/${id}/cancel-agent${params}`, { method: 'POST' });
},
```

**Step 2: Commit**

```bash
git add packages/frontend/src/api.ts
git commit -m "feat: add insights API methods to frontend client"
```

---

### Task 11: Create InsightsTab component

**Files:**
- Create: `packages/frontend/src/components/InsightsTab.tsx`

**Step 1: Create the component**

Create `packages/frontend/src/components/InsightsTab.tsx`:

```tsx
import { useState } from 'react';
import { AgentActivityPanel } from './AgentActivityPanel.js';
import type { ActivityEntry } from './AgentActivityPanel.js';

interface InsightItem {
  title: string;
  description: string;
  applied?: boolean;
}

interface RecurringPatternItem {
  title: string;
  description: string;
  prIds: string[];
}

interface InsightCategories {
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}

interface InsightsTabProps {
  insights: { categories: InsightCategories; branchRef: string | null; updatedAt: string } | null;
  hasComments: boolean;
  analyzerRunning: boolean;
  analyzerActivity: ActivityEntry[];
  onRunAnalyzer: () => void;
  onCancelAnalyzer: () => void;
}

function CategorySection({ title, items, renderItem }: {
  title: string;
  items: any[];
  renderItem: (item: any, i: number) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:opacity-80"
        style={{ color: 'var(--color-text)' }}
      >
        <span>{collapsed ? '▶' : '▼'}</span>
        <span>{title}</span>
        <span className="opacity-50">({items.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 ml-4">
          {items.map((item, i) => renderItem(item, i))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <div
      className="p-3 rounded border text-sm"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))' }}
    >
      <div className="font-medium">{item.title}</div>
      <div className="mt-1 opacity-80">{item.description}</div>
      {item.applied !== undefined && (
        <span
          className="inline-block mt-2 text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: item.applied ? 'rgba(46,160,67,0.15)' : 'rgba(130,130,130,0.1)',
            color: item.applied ? 'var(--color-success)' : 'var(--color-text)',
          }}
        >
          {item.applied ? 'Applied' : 'Pending'}
        </span>
      )}
    </div>
  );
}

export function InsightsTab({ insights, hasComments, analyzerRunning, analyzerActivity, onRunAnalyzer, onCancelAnalyzer }: InsightsTabProps) {
  // Analyzer running state
  if (analyzerRunning) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-sm" style={{ color: 'var(--color-warning, #d29922)' }}>Analyzer running...</span>
          <button
            onClick={onCancelAnalyzer}
            className="text-xs px-2 py-0.5 rounded border hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            Cancel
          </button>
        </div>
        <AgentActivityPanel entries={analyzerActivity} />
      </div>
    );
  }

  // Empty state — no comments yet
  if (!hasComments && !insights) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm opacity-70">
          Insights will be available after review comments are added.
          The analyzer examines agent session transcripts and comment history
          to recommend workflow improvements.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Run Analyzer button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Workflow Insights</h3>
        {hasComments && (
          <button
            onClick={onRunAnalyzer}
            className="text-xs px-3 py-1 rounded border hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
          >
            Run Analyzer
          </button>
        )}
      </div>

      {/* No insights yet but has comments */}
      {!insights && (
        <p className="text-sm opacity-70">
          No insights yet. Click "Run Analyzer" to analyze agent behavior and comment patterns.
        </p>
      )}

      {/* Render insights categories */}
      {insights && (
        <div>
          {insights.branchRef && (
            <div
              className="mb-4 p-2 rounded text-xs"
              style={{ backgroundColor: 'rgba(130,80,223,0.1)' }}
            >
              File changes on branch: <code>{insights.branchRef}</code>
            </div>
          )}

          <CategorySection
            title="CLAUDE.md Recommendations"
            items={insights.categories.claudeMdRecommendations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Skill Recommendations"
            items={insights.categories.skillRecommendations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Prompt & Context Engineering"
            items={insights.categories.promptEngineering}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Agent Behavior Observations"
            items={insights.categories.agentBehaviorObservations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Recurring Patterns"
            items={insights.categories.recurringPatterns}
            renderItem={(item, i) => (
              <div key={i}>
                <InsightCard item={item} />
                {item.prIds.length > 0 && (
                  <div className="ml-3 mt-1 text-xs opacity-60">
                    Seen in {item.prIds.length} PR{item.prIds.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          />

          <div className="mt-4 text-xs opacity-50">
            Last updated: {new Date(insights.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/frontend/src/components/InsightsTab.tsx
git commit -m "feat: add InsightsTab component with category rendering"
```

---

### Task 12: Integrate InsightsTab into PRReview page

**Files:**
- Modify: `packages/frontend/src/pages/PRReview.tsx`

**Step 1: Add insights state and tab to PRReview**

Add the following to `PRReview.tsx`:

1. Import `InsightsTab` and `api.insights`
2. Add state: `insights`, `insightsLoading`, `insightsActivity`, `activeTab` (default `'review'`)
3. Fetch insights on mount and on WebSocket `insights:updated` events
4. Filter `agent:output` events by `source` field — route `code-fix` to `agentActivity`, `insights` to `insightsActivity`
5. Add tab switcher UI between "Review" and "Insights"
6. Render `InsightsTab` when activeTab is `'insights'`

Key changes to the WebSocket handler:

```typescript
if (msg.event === 'agent:output' && msg.data?.prId === prId && msg.data?.entry) {
  if (msg.data.source === 'insights') {
    setInsightsActivity((prev) => [...prev.slice(-49), msg.data.entry]);
  } else {
    setAgentActivity((prev) => [...prev.slice(-49), msg.data.entry]);
  }
}
if (msg.event === 'agent:working' && msg.data?.source === 'insights') {
  setInsightsActivity([]);
}
```

Add tab UI at the top of the main content area:

```tsx
<div className="flex border-b" style={{ borderColor: 'var(--color-border)' }}>
  <button
    onClick={() => setActiveTab('review')}
    className={`px-4 py-2 text-sm ${activeTab === 'review' ? 'border-b-2' : 'opacity-60'}`}
    style={activeTab === 'review' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
  >
    Review
  </button>
  <button
    onClick={() => setActiveTab('insights')}
    className={`px-4 py-2 text-sm ${activeTab === 'insights' ? 'border-b-2' : 'opacity-60'}`}
    style={activeTab === 'insights' ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
  >
    Insights
  </button>
</div>
```

When `activeTab === 'insights'`, render `InsightsTab` instead of the FileTree + DiffViewer.

**Step 2: Verify it builds**

Run: `npm run build --workspace=packages/frontend`
Expected: Builds without errors

**Step 3: Commit**

```bash
git add packages/frontend/src/pages/PRReview.tsx
git commit -m "feat: integrate InsightsTab into PR review page with tab navigation"
```

---

### Task 13: End-to-end verification

**Step 1: Run all backend tests**

Run: `npm run test --workspace=packages/backend -- --run`
Expected: All tests PASS

**Step 2: Run full build**

Run: `npm run build`
Expected: All packages build successfully

**Step 3: Manual smoke test**

Run: `npm run dev`

- Navigate to a PR in the UI
- Verify the "Insights" tab appears
- Verify empty state message shows when no comments exist
- Add a comment, verify "Run Analyzer" button appears

**Step 4: Commit any fixes from smoke testing**

---

### Task 14: Create analyzer skill file (stub)

**Files:**
- Create: A skill file for the analyzer agent (location TBD based on project skill conventions)

This is a stub that will be iterated on as we observe the analyzer's behavior. It contains the stable methodology that the prompt builder references.

**Step 1: Create the skill**

The skill file should contain:
- How to read JSONL session transcripts (scan for user prompts, tool calls, errors, reasoning)
- The 5 output categories with detailed descriptions
- How to correlate transcript behavior with review comments
- How to check both global (`~/.claude/CLAUDE.md`) and project-level (`CLAUDE.md`) files
- How to use the shepherd insights CLI commands
- Guidance on working additively (read existing insights first)
- When creating new skills as recommendations: use the `skill-creator` skill if it is available in the current environment. If no skill-creation tool is installed, note this in the insights and recommend the user install `anthropic/skills/skill-creator` (https://github.com/anthropics/skills/tree/main/skills/skill-creator)

This is a content authoring task — the skill is a markdown file, not code. Create it and iterate based on real analyzer runs.

**Step 2: Commit**

```bash
git add <skill-file>
git commit -m "feat: add workflow analyzer skill file (initial version)"
```
