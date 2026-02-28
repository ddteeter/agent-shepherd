import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitService } from '../git.js';
import { execSync } from 'child_process';

describe('GitService', () => {
  let repoPath: string;
  let gitService: GitService;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'shepherd-test-'));
    gitService = new GitService(repoPath);

    execSync('git init', { cwd: repoPath });
    execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
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
    expect(branch).toBe('main');
  });

  it('gets diff between branches', async () => {
    execSync('git checkout -b feat/test', { cwd: repoPath });
    await writeFile(join(repoPath, 'file.txt'), 'hello\nworld\n');
    execSync('git add . && git commit -m "add world"', { cwd: repoPath });

    const diff = await gitService.getDiff('main', 'feat/test');
    expect(diff).toContain('+world');
  });

  it('lists changed files', async () => {
    execSync('git checkout -b feat/test2', { cwd: repoPath });
    await writeFile(join(repoPath, 'new-file.txt'), 'new\n');
    execSync('git add . && git commit -m "add file"', { cwd: repoPath });

    const files = await gitService.getChangedFiles('main', 'feat/test2');
    expect(files).toContain('new-file.txt');
  });

  it('gets HEAD SHA for a branch', async () => {
    const sha = await gitService.getHeadSha('main');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('gets diff between two commits', async () => {
    execSync('git checkout -b feat/inter', { cwd: repoPath });
    await writeFile(join(repoPath, 'file.txt'), 'hello\nworld\n');
    execSync('git add . && git commit -m "add world"', { cwd: repoPath });

    const sha1 = await gitService.getHeadSha('main');
    const sha2 = await gitService.getHeadSha('feat/inter');

    const diff = await gitService.getDiffBetweenCommits(sha1, sha2);
    expect(diff).toContain('+world');
  });
});
