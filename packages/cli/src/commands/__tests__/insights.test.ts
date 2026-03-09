import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { insightsCommand } from '../insights.js';
import type { ApiClient } from '../../api-client.js';

describe('insightsCommand', () => {
  let program: Command;
  let client: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn(), put: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {
      return;
    });
    insightsCommand(program, client as unknown as ApiClient);
  });

  describe('get', () => {
    it('shows "no insights" when result is falsy', async () => {
      client.get.mockResolvedValue(undefined);
      await program.parseAsync(['node', 'test', 'insights', 'get', 'pr-1']);
      expect(logSpy).toHaveBeenCalledWith('No insights found for this PR.');
    });

    it('prints categories as JSON', async () => {
      const categories = { naming: { count: 2 } };
      client.get.mockResolvedValue({ categories });
      await program.parseAsync(['node', 'test', 'insights', 'get', 'pr-1']);
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(categories, undefined, 2),
      );
    });
  });

  describe('update', () => {
    it('errors when --stdin not provided', async () => {
      await program.parseAsync(['node', 'test', 'insights', 'update', 'pr-1']);
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });
  });

  describe('history', () => {
    it('fetches and prints comments history', async () => {
      const comments = [{ id: '1', body: 'test' }];
      client.get.mockResolvedValue(comments);
      await program.parseAsync([
        'node',
        'test',
        'insights',
        'history',
        'proj-1',
      ]);
      expect(client.get).toHaveBeenCalledWith(
        '/api/projects/proj-1/comments/history',
      );
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(comments, undefined, 2),
      );
    });
  });
});
