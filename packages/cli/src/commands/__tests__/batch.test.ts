import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { batchCommand } from '../batch.js';
import type { ApiClient } from '../../api-client.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';

describe('batchCommand', () => {
  let program: Command;
  let client: {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { post: vi.fn(), get: vi.fn(), put: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {
      return;
    });
    batchCommand(program, client as unknown as ApiClient);
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

    expect(readFile).toHaveBeenCalledWith('/tmp/comments.json', 'utf8');
    expect(client.post).toHaveBeenCalledWith('/api/prs/pr-1/comments/batch', {
      comments: [],
    });
    expect(logSpy).toHaveBeenCalledWith('Batch submitted: 3 items created');
  });

  it('errors when neither --file nor --stdin provided', async () => {
    await program.parseAsync(['node', 'test', 'batch', 'pr-1']);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
