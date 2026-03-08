import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Diff API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'shepherd-diff-'));
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

  it('GET /api/prs/:id/diff returns the diff', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.diff).toContain('+const y = 2;');
    expect(body.files).toContain('index.ts');
  });

  it('GET /api/prs/:id/diff?cycle=N returns stored snapshot', async () => {
    // Cycle 1 snapshot is now created at PR submission time
    const diffRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(diffRes.statusCode).toBe(200);
    const body = diffRes.json();
    expect(body.diff).toContain('+const y = 2;');
    expect(body.files).toContain('index.ts');
    expect(body.cycleNumber).toBe(1);
    expect(body.isSnapshot).toBe(true);
  });

  it('GET /api/prs/:id/diff?cycle=N returns 404 for non-existent cycle', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=99`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain('Review cycle 99 not found');
  });

  it('GET /api/prs/:id/diff?cycle=1 returns snapshot created at PR submission', async () => {
    // Cycle 1 snapshot is created automatically at PR submission
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().isSnapshot).toBe(true);
    expect(response.json().diff).toContain('+const y = 2;');
  });

  it('GET /api/prs/:id/diff?cycle=invalid returns 400', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=abc`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Invalid cycle number');
  });

  it('POST /api/prs/:id/diff/snapshot returns existing snapshot for cycle 1', async () => {
    // Cycle 1 already has a snapshot from PR creation
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.alreadyExists).toBe(true);
    expect(body.cycleNumber).toBe(1);
  });

  it('POST /api/prs/:id/diff/snapshot returns existing if already stored', async () => {
    // Cycle 1 already has a snapshot from PR creation — both calls return existing
    const first = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().alreadyExists).toBe(true);

    // Second call — should also return existing with same id
    const second = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(second.statusCode).toBe(200);
    const body = second.json();
    expect(body.alreadyExists).toBe(true);
    expect(body.id).toBe(first.json().id);
  });

  it('POST /api/prs/:id/diff/snapshot returns 404 for non-existent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/diff/snapshot',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/cycles/details returns cycles with snapshot info', async () => {
    // Cycle 1 now has a snapshot from PR creation
    const res = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(res.statusCode).toBe(200);
    const cycles = res.json();
    expect(cycles).toHaveLength(1);
    expect(cycles[0].hasDiffSnapshot).toBe(true);
    expect(cycles[0].cycleNumber).toBe(1);
  });

  it('agent-ready stores a diff snapshot for the new cycle', async () => {
    // Request changes on cycle 1
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Agent signals ready — this should create cycle 2 with a snapshot
    const readyRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json().cycleNumber).toBe(2);

    // Verify the snapshot was stored for cycle 2
    const diffRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(diffRes.statusCode).toBe(200);
    expect(diffRes.json().diff).toContain('+const y = 2;');
    expect(diffRes.json().isSnapshot).toBe(true);
  });

  it('GET /api/prs/:id/diff?cycle=N returns snapshot for superseded cycle after resubmit', async () => {
    // Cycle 1 has a snapshot from PR creation. Now resubmit to supersede it.
    const resubmitRes = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/resubmit`,
      payload: { context: 'Fixed manually outside review flow' },
    });
    expect(resubmitRes.statusCode).toBe(200);
    expect(resubmitRes.json().cycleNumber).toBe(2);

    // Verify cycle 1 is now superseded
    const cyclesRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    const cycles = cyclesRes.json();
    const cycle1 = cycles.find((c: any) => c.cycleNumber === 1);
    expect(cycle1.status).toBe('superseded');
    expect(cycle1.hasDiffSnapshot).toBe(true);

    // Fetching the superseded cycle's diff should still work
    const diffRes = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(diffRes.statusCode).toBe(200);
    const body = diffRes.json();
    expect(body.diff).toContain('+const y = 2;');
    expect(body.isSnapshot).toBe(true);
    expect(body.cycleNumber).toBe(1);
  });

  it('GET /api/prs/:id/cycles/details returns 404 for non-existent PR', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/cycles/details',
    });
    expect(response.statusCode).toBe(404);
  });
});
