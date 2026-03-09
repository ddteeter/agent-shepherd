import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { listProjectsCommand } from '../list-projects.js';
import type { ApiClient } from '../../api-client.js';

describe('listProjectsCommand', () => {
  let program: Command;
  let client: { get: ReturnType<typeof vi.fn> };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    listProjectsCommand(program, client as unknown as ApiClient);
  });

  it('shows message when no projects', async () => {
    client.get.mockResolvedValue([]);
    await program.parseAsync(['node', 'test', 'list-projects']);
    expect(logSpy).toHaveBeenCalledWith(
      'No projects registered. Use "agent-shepherd init <path>" to register one.',
    );
  });

  it('lists projects in table format', async () => {
    client.get.mockResolvedValue([
      { id: 'uuid-1234', name: 'myproject', path: '/home/user/proj' },
    ]);
    await program.parseAsync(['node', 'test', 'list-projects']);

    const allOutput = vi
      .mocked(console.log)
      .mock.calls.map((c) => String(c[0]))
      .join('\n');
    expect(allOutput).toContain('ID');
    expect(allOutput).toContain('Name');
    expect(allOutput).toContain('myproject');
    expect(allOutput).toContain('/home/user/proj');
  });
});
