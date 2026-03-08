import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { submitCommand } from '../submit.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { readFile } from 'fs/promises';
import { execSync } from 'child_process';

describe('submitCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { post: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    submitCommand(program, client);
  });

  it('submits PR with auto-detected branch', async () => {
    vi.mocked(execSync).mockReturnValue('feat/my-branch\n');
    client.post.mockResolvedValue({ id: 'pr-1', title: 'Agent PR', status: 'open' });

    await program.parseAsync(['node', 'test', 'submit', '-p', 'proj-1']);

    expect(execSync).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' });
    expect(client.post).toHaveBeenCalledWith('/api/projects/proj-1/prs', expect.objectContaining({
      title: 'Agent PR',
      sourceBranch: 'feat/my-branch',
    }));
    expect(logSpy).toHaveBeenCalledWith('PR created: pr-1');
  });

  it('uses provided source branch and title', async () => {
    client.post.mockResolvedValue({ id: 'pr-2', title: 'Custom title', status: 'open' });

    await program.parseAsync(['node', 'test', 'submit', '-p', 'proj-1', '-t', 'Custom title', '-s', 'my-branch']);

    expect(client.post).toHaveBeenCalledWith('/api/projects/proj-1/prs', expect.objectContaining({
      title: 'Custom title',
      sourceBranch: 'my-branch',
    }));
  });

  it('falls back to HEAD when git fails', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('not a git repo'); });
    client.post.mockResolvedValue({ id: 'pr-3', title: 'Agent PR', status: 'open' });

    await program.parseAsync(['node', 'test', 'submit', '-p', 'proj-1']);

    expect(client.post).toHaveBeenCalledWith('/api/projects/proj-1/prs', expect.objectContaining({
      sourceBranch: 'HEAD',
    }));
  });

  it('reads context file when provided', async () => {
    vi.mocked(execSync).mockReturnValue('main\n');
    vi.mocked(readFile).mockResolvedValue('{"summary": "changes"}');
    client.post.mockResolvedValue({ id: 'pr-4', title: 'Agent PR', status: 'open' });

    await program.parseAsync(['node', 'test', 'submit', '-p', 'proj-1', '-c', '/tmp/context.json']);

    expect(readFile).toHaveBeenCalledWith('/tmp/context.json', 'utf-8');
    expect(client.post).toHaveBeenCalledWith('/api/projects/proj-1/prs', expect.objectContaining({
      agentContext: '{"summary": "changes"}',
    }));
  });

  it('reads file groups when provided', async () => {
    vi.mocked(execSync).mockReturnValue('main\n');
    const groups = [{ name: 'core', files: ['a.ts'] }];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(groups));
    client.post.mockResolvedValue({ id: 'pr-5', title: 'Agent PR', status: 'open' });

    await program.parseAsync(['node', 'test', 'submit', '-p', 'proj-1', '--file-groups', '/tmp/groups.json']);

    expect(client.post).toHaveBeenCalledWith('/api/projects/proj-1/prs', expect.objectContaining({
      fileGroups: groups,
    }));
  });
});
