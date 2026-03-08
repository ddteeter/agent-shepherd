import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { listProjectsCommand } from '../list-projects.js';

describe('listProjectsCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    listProjectsCommand(program, client);
  });

  it('shows message when no projects', async () => {
    client.get.mockResolvedValue([]);
    await program.parseAsync(['node', 'test', 'list-projects']);
    expect(logSpy).toHaveBeenCalledWith('No projects registered. Use "agent-shepherd init <path>" to register one.');
  });

  it('lists projects in table format', async () => {
    client.get.mockResolvedValue([
      { id: 'uuid-1234', name: 'myproject', path: '/home/user/proj' },
    ]);
    await program.parseAsync(['node', 'test', 'list-projects']);

    const allOutput = logSpy.mock.calls.map(c => c[0]).join('\n');
    expect(allOutput).toContain('ID');
    expect(allOutput).toContain('Name');
    expect(allOutput).toContain('myproject');
    expect(allOutput).toContain('/home/user/proj');
  });
});
