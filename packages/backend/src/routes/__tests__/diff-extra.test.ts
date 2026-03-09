import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestServer, jsonBody } from '../../__tests__/helpers.js';
import { schema } from '../../db/index.js';
import { extractFilesFromDiff } from '../diff.js';

describe('Diff API - additional coverage', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'shepherd-diff-extra-'));
    execSync('git init', { cwd: repoPath });
    execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });
    await writeFile(path.join(repoPath, 'index.ts'), 'const x = 1;\n');
    execSync('git add . && git commit -m "init"', { cwd: repoPath });
    execSync('git checkout -b feat/change', { cwd: repoPath });
    await writeFile(
      path.join(repoPath, 'index.ts'),
      'const x = 1;\nconst y = 2;\n',
    );
    execSync('git add . && git commit -m "add y"', { cwd: repoPath });

    ({ server, inject } = await createTestServer());

    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: repoPath },
    });
    projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Add y', description: '', sourceBranch: 'feat/change' },
    });
    prId = jsonBody(prResponse).id as string;
  });

  afterEach(async () => {
    await server.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it('GET /api/prs/:id/diff returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/diff',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/file-groups returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/file-groups',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/file-groups returns file groups for latest cycle', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).cycleNumber).toBe(1);
  });

  it('GET /api/prs/:id/file-groups?cycle=1 returns file groups for specific cycle', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups?cycle=1`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).cycleNumber).toBe(1);
  });

  it('GET /api/prs/:id/file-groups?cycle=invalid returns 400', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups?cycle=abc`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/prs/:id/file-groups?cycle=99 returns 404', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups?cycle=99`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/diff with from/to returns inter-cycle diff', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).isInterCycleDiff).toBe(true);
  });

  it('GET /api/prs/:id/diff with invalid from/to returns 400', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=abc&to=2`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/prs/:id/diff with from/to where cycle is missing returns 404', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=99`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/diff with from missing cycle returns 404', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=99&to=1`,
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('Diff API - inter-cycle SHA edge cases', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 400 when inter-cycle diff has cycles without commit SHAs', async () => {
    const database = server.db;

    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-sha' },
    });
    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${jsonBody(projectResponse).id as string}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = jsonBody(prResponse).id as string;

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    database
      .update(schema.reviewCycles)
      .set({ commitSha: undefined })
      .where(eq(schema.reviewCycles.id, cycles[0].id))
      .run();

    database
      .insert(schema.reviewCycles)
      .values({
        id: randomUUID(),
        prId,
        cycleNumber: 2,
        status: 'pending_review',
      })
      .run();

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(response.statusCode).toBe(400);
    expect(jsonBody(response).error).toContain('Commit SHAs not available');
  });

  it('returns 404 for snapshot on cycle without stored snapshot', async () => {
    const database = server.db;

    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-snapshot' },
    });
    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${jsonBody(projectResponse).id as string}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = jsonBody(prResponse).id as string;

    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    database
      .delete(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, cycles[0].id))
      .run();

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(response.statusCode).toBe(404);
    expect(jsonBody(response).error).toContain('No diff snapshot');
  });

  it('handles from/to with negative values as 400', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-neg' },
    });
    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${jsonBody(projectResponse).id as string}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${jsonBody(prResponse).id as string}/diff?from=-1&to=1`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('handles cycle=0 as invalid', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-zero' },
    });
    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${jsonBody(projectResponse).id as string}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${jsonBody(prResponse).id as string}/diff?cycle=0`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('handles file-groups?cycle=0 as invalid', async () => {
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-fg-zero' },
    });
    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${jsonBody(projectResponse).id as string}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${jsonBody(prResponse).id as string}/file-groups?cycle=0`,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('extractFilesFromDiff', () => {
  it('extracts file paths from a unified diff', () => {
    const diff = `diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1 +1,2 @@
 const x = 1;
+const y = 2;
diff --git a/src/other.ts b/src/other.ts
--- /dev/null
+++ b/src/other.ts
@@ -0,0 +1 @@
+new file`;
    const files = extractFilesFromDiff(diff);
    expect(files).toEqual(['src/index.ts', 'src/other.ts']);
  });

  it('returns empty array for empty diff', () => {
    expect(extractFilesFromDiff('')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(extractFilesFromDiff(undefined as unknown as string)).toEqual([]);
    expect(extractFilesFromDiff(undefined as unknown as string)).toEqual([]);
  });
});
