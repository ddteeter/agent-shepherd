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
});
