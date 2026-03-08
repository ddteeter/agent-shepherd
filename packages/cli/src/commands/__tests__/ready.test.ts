import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { readyCommand } from '../ready.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';

describe('readyCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { post: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    readyCommand(program, client);
  });

  it('signals ready without batch file', async () => {
    client.post.mockResolvedValue({ cycleNumber: 2 });
    await program.parseAsync(['node', 'test', 'ready', 'pr-1']);

    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/agent-ready', {
      fileGroups: undefined,
    });
    expect(logSpy).toHaveBeenCalledWith('PR ready for review (cycle 2)');
  });

  it('submits batch file before signaling ready', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify({ comments: [] }));
    client.post
      .mockResolvedValueOnce({ created: 2 })
      .mockResolvedValueOnce({ cycleNumber: 3 });

    await program.parseAsync([
      'node',
      'test',
      'ready',
      'pr-1',
      '-f',
      '/tmp/batch.json',
    ]);

    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/comments/batch', {
      comments: [],
    });
    expect(logSpy).toHaveBeenCalledWith('Batch submitted: 2 items created');
    expect(logSpy).toHaveBeenCalledWith('PR ready for review (cycle 3)');
  });

  it('reads file groups when --file-groups is provided', async () => {
    const groups = [{ name: 'core', files: ['a.ts'] }];
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(groups));
    client.post.mockResolvedValue({ cycleNumber: 2 });

    await program.parseAsync([
      'node',
      'test',
      'ready',
      'pr-1',
      '--file-groups',
      '/tmp/groups.json',
    ]);

    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/agent-ready', {
      fileGroups: groups,
    });
  });
});
