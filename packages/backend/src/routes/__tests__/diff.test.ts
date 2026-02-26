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

  it('GET /api/prs/:id/diff?cycle=N returns stored snapshot', async () => {
    // Create a snapshot for the current (first) cycle
    const snapshotRes = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(snapshotRes.statusCode).toBe(201);
    const snapshot = snapshotRes.json();
    expect(snapshot.cycleNumber).toBe(1);

    // Fetch the snapshot via cycle query param
    const diffRes = await server.inject({
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
    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=99`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain('Review cycle 99 not found');
  });

  it('GET /api/prs/:id/diff?cycle=N returns 404 when no snapshot exists', async () => {
    // Cycle 1 exists (created with PR) but has no snapshot
    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain('No diff snapshot found');
  });

  it('GET /api/prs/:id/diff?cycle=invalid returns 400', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=abc`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Invalid cycle number');
  });

  it('POST /api/prs/:id/diff/snapshot stores a snapshot', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.id).toBeDefined();
    expect(body.cycleNumber).toBe(1);
  });

  it('POST /api/prs/:id/diff/snapshot returns existing if already stored', async () => {
    // Store first time
    const first = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(first.statusCode).toBe(201);

    // Store second time — should return existing
    const second = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(second.statusCode).toBe(200);
    const body = second.json();
    expect(body.alreadyExists).toBe(true);
    expect(body.id).toBe(first.json().id);
  });

  it('POST /api/prs/:id/diff/snapshot returns 404 for non-existent PR', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/prs/nonexistent/diff/snapshot',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/cycles/details returns cycles with snapshot info', async () => {
    // Before snapshot
    const beforeRes = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(beforeRes.statusCode).toBe(200);
    const beforeCycles = beforeRes.json();
    expect(beforeCycles).toHaveLength(1);
    expect(beforeCycles[0].hasDiffSnapshot).toBe(false);

    // Create a snapshot
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });

    // After snapshot
    const afterRes = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    const afterCycles = afterRes.json();
    expect(afterCycles).toHaveLength(1);
    expect(afterCycles[0].hasDiffSnapshot).toBe(true);
    expect(afterCycles[0].cycleNumber).toBe(1);
  });

  it('agent-ready stores a diff snapshot for the new cycle', async () => {
    // Request changes on cycle 1
    await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Agent signals ready — this should create cycle 2 with a snapshot
    const readyRes = await server.inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json().cycleNumber).toBe(2);

    // Verify the snapshot was stored for cycle 2
    const diffRes = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(diffRes.statusCode).toBe(200);
    expect(diffRes.json().diff).toContain('+const y = 2;');
    expect(diffRes.json().isSnapshot).toBe(true);
  });

  it('GET /api/prs/:id/cycles/details returns 404 for non-existent PR', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/prs/nonexistent/cycles/details',
    });
    expect(response.statusCode).toBe(404);
  });
});
