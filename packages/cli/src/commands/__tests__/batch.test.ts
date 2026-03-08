import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { batchCommand } from '../batch.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';

describe('batchCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { post: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    batchCommand(program, client);
  });

  it('submits batch from file', async () => {
    const payload = JSON.stringify({ comments: [] });
    vi.mocked(readFile).mockResolvedValue(payload);
    client.post.mockResolvedValue({ created: 3 });

    await program.parseAsync([
      'node',
      'test',
      'batch',
      'pr-1',
      '-f',
      '/tmp/comments.json',
    ]);

    expect(readFile).toHaveBeenCalledWith('/tmp/comments.json', 'utf-8');
    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/comments/batch', {
      comments: [],
    });
    expect(logSpy).toHaveBeenCalledWith('Batch submitted: 3 items created');
  });

  it('errors when neither --file nor --stdin provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });

    await expect(
      program.parseAsync(['node', 'test', 'batch', 'pr-1']),
    ).rejects.toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('Must specify --file or --stdin');
    exitSpy.mockRestore();
  });
});
