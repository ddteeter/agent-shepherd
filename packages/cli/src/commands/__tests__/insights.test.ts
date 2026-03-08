import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { insightsCommand } from '../insights.js';

describe('insightsCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn(), put: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    insightsCommand(program, client);
  });

  describe('get', () => {
    it('shows "no insights" when result is null', async () => {
      client.get.mockResolvedValue(null);
      await program.parseAsync(['node', 'test', 'insights', 'get', 'pr-1']);
      expect(logSpy).toHaveBeenCalledWith('No insights found for this PR.');
    });

    it('prints categories as JSON', async () => {
      const categories = { naming: { count: 2 } };
      client.get.mockResolvedValue({ categories });
      await program.parseAsync(['node', 'test', 'insights', 'get', 'pr-1']);
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify(categories, null, 2));
    });
  });

  describe('update', () => {
    it('errors when --stdin not provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      await expect(
        program.parseAsync(['node', 'test', 'insights', 'update', 'pr-1']),
      ).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith('Must specify --stdin');
      exitSpy.mockRestore();
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
      expect(logSpy).toHaveBeenCalledWith(JSON.stringify(comments, null, 2));
    });
  });
});
