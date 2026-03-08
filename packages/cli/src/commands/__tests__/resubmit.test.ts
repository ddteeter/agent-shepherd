import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { resubmitCommand } from '../resubmit.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';

describe('resubmitCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { post: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    resubmitCommand(program, client);
  });

  it('resubmits PR with context from file', async () => {
    vi.mocked(readFile).mockResolvedValue('Updated the config parsing logic');
    client.post.mockResolvedValue({ cycleNumber: 4 });

    await program.parseAsync([
      'node',
      'test',
      'resubmit',
      'pr-1',
      '-c',
      '/tmp/context.txt',
    ]);

    expect(readFile).toHaveBeenCalledWith('/tmp/context.txt', 'utf-8');
    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/resubmit', {
      context: 'Updated the config parsing logic',
    });
    expect(logSpy).toHaveBeenCalledWith('PR resubmitted for review (cycle 4)');
  });
});
