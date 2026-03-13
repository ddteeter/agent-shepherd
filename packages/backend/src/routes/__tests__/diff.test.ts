import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';

describe('Diff API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let repoPath: string;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(path.join(tmpdir(), 'shepherd-diff-'));
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

  it('GET /api/prs/:id/diff returns the diff', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff`,
    });
    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body.diff).toContain('+const y = 2;');
    expect(body.files).toContain('index.ts');
  });

  it('GET /api/prs/:id/diff?cycle=N returns stored snapshot', async () => {
    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(diffResponse.statusCode).toBe(200);
    const body = jsonBody(diffResponse);
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
    expect(jsonBody(response).error).toContain('Review cycle 99 not found');
  });

  it('GET /api/prs/:id/diff?cycle=1 returns snapshot created at PR submission', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).isSnapshot).toBe(true);
    expect(jsonBody(response).diff).toContain('+const y = 2;');
  });

  it('GET /api/prs/:id/diff?cycle=invalid returns 400', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=abc`,
    });
    expect(response.statusCode).toBe(400);
    expect(jsonBody(response).error).toContain('Invalid cycle number');
  });

  it('POST /api/prs/:id/diff/snapshot returns existing snapshot for cycle 1', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(response.statusCode).toBe(200);
    const body = jsonBody(response);
    expect(body.id).toBeDefined();
    expect(body.alreadyExists).toBe(true);
    expect(body.cycleNumber).toBe(1);
  });

  it('POST /api/prs/:id/diff/snapshot returns existing if already stored', async () => {
    const first = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(first.statusCode).toBe(200);
    expect(jsonBody(first).alreadyExists).toBe(true);

    const second = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/diff/snapshot`,
    });
    expect(second.statusCode).toBe(200);
    const body = jsonBody(second);
    expect(body.alreadyExists).toBe(true);
    expect(body.id).toBe(jsonBody(first).id);
  });

  it('POST /api/prs/:id/diff/snapshot returns 404 for non-existent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/diff/snapshot',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/cycles/details returns cycles with snapshot info', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    expect(response.statusCode).toBe(200);
    const cycles = jsonArrayBody(response);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].hasDiffSnapshot).toBe(true);
    expect(cycles[0].cycleNumber).toBe(1);
  });

  it('agent-ready stores a diff snapshot for the new cycle', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    const readyResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });
    expect(readyResponse.statusCode).toBe(200);
    expect(jsonBody(readyResponse).cycleNumber).toBe(2);

    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=2`,
    });
    expect(diffResponse.statusCode).toBe(200);
    expect(jsonBody(diffResponse).diff).toContain('+const y = 2;');
    expect(jsonBody(diffResponse).isSnapshot).toBe(true);
  });

  it('GET /api/prs/:id/diff?cycle=N returns snapshot for superseded cycle after resubmit', async () => {
    const resubmitResponse = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/resubmit`,
      payload: { context: 'Fixed manually outside review flow' },
    });
    expect(resubmitResponse.statusCode).toBe(200);
    expect(jsonBody(resubmitResponse).cycleNumber).toBe(2);

    const cyclesResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/cycles/details`,
    });
    const cycles = jsonArrayBody(cyclesResponse);
    const cycle1 = cycles.find((c) => c.cycleNumber === 1);
    expect(cycle1?.status).toBe('superseded');
    expect(cycle1?.hasDiffSnapshot).toBe(true);

    const diffResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/diff?cycle=1`,
    });
    expect(diffResponse.statusCode).toBe(200);
    const body = jsonBody(diffResponse);
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
