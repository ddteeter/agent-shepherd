import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestServer } from '../../__tests__/helpers.js';
import { schema } from '../../db/index.js';
import { extractFilesFromDiff } from '../diff.js';

describe('Diff API - additional coverage', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'shepherd-diff-extra-'));
    execSync('git init', { cwd: repoPath });
    execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });
    await writeFile(join(repoPath, 'index.ts'), 'const x = 1;\n');
    execSync('git add . && git commit -m "init"', { cwd: repoPath });
    execSync('git checkout -b feat/change', { cwd: repoPath });
    await writeFile(join(repoPath, 'index.ts'), 'const x = 1;\nconst y = 2;\n');
    execSync('git add . && git commit -m "add y"', { cwd: repoPath });

    ({ server, inject } = await createTestServer());

    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: repoPath },
    });
    projectId = proj.json().id;

    const pr = await inject({
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
    expect(response.json().cycleNumber).toBe(1);
  });

  it('GET /api/prs/:id/file-groups?cycle=1 returns file groups for specific cycle', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/file-groups?cycle=1`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().cycleNumber).toBe(1);
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
    // Request changes on cycle 1
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Agent ready creates cycle 2
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().isInterCycleDiff).toBe(true);
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
    const db = (server as any).db;

    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-sha' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    // Clear the commit SHA from cycle 1
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    db.update(schema.reviewCycles)
      .set({ commitSha: null })
      .where(eq(schema.reviewCycles.id, cycles[0].id))
      .run();

    db.insert(schema.reviewCycles)
      .values({
        id: randomUUID(),
        prId,
        cycleNumber: 2,
        status: 'pending_review',
        commitSha: null,
      })
      .run();

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?from=1&to=2`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Commit SHAs not available');
  });

  it('returns 404 for snapshot on cycle without stored snapshot', async () => {
    const db = (server as any).db;

    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-snapshot' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    // Delete the snapshot that was created at PR submission
    const cycles = db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    db.delete(schema.diffSnapshots)
      .where(eq(schema.diffSnapshots.reviewCycleId, cycles[0].id))
      .run();

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain('No diff snapshot');
  });

  it('handles from/to with negative values as 400', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-neg' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${pr.json().id}/diff?from=-1&to=1`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('handles cycle=0 as invalid', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-zero' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${pr.json().id}/diff?cycle=0`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('handles file-groups?cycle=0 as invalid', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-fg-zero' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${pr.json().id}/file-groups?cycle=0`,
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
    expect(extractFilesFromDiff(null as any)).toEqual([]);
    expect(extractFilesFromDiff(undefined as any)).toEqual([]);
  });
});
