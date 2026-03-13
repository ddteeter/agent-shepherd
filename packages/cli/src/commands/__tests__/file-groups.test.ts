import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { fileGroupsCommand } from '../file-groups.js';
import type { ApiClient } from '../../api-client.js';

describe('fileGroupsCommand', () => {
  let program: Command;
  let client: { get: ReturnType<typeof vi.fn> };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    fileGroupsCommand(program, client as unknown as ApiClient);
  });

  it('shows "no file groups" when undefined', async () => {
    client.get.mockResolvedValue({ fileGroups: undefined, cycleNumber: 1 });
    await program.parseAsync(['node', 'test', 'file-groups', 'pr-1']);

    expect(client.get).toHaveBeenCalledWith('/api/prs/pr-1/file-groups');
    expect(logSpy).toHaveBeenCalledWith('No file groups defined for this PR.');
  });

  it('prints file groups as JSON', async () => {
    const groups = [{ name: 'core', files: ['a.ts'] }];
    client.get.mockResolvedValue({ fileGroups: groups, cycleNumber: 2 });
    await program.parseAsync(['node', 'test', 'file-groups', 'pr-1']);

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(groups, undefined, 2));
  });

  it('passes cycle query param when provided', async () => {
    client.get.mockResolvedValue({ fileGroups: [], cycleNumber: 3 });
    await program.parseAsync([
      'node',
      'test',
      'file-groups',
      'pr-1',
      '--cycle',
      '3',
    ]);

    expect(client.get).toHaveBeenCalledWith(
      '/api/prs/pr-1/file-groups?cycle=3',
    );
  });
});
