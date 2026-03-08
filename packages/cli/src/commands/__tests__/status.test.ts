import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { statusCommand } from '../status.js';

describe('statusCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    statusCommand(program, client);
  });

  it('shows PR status with cycle info', async () => {
    client.get
      .mockResolvedValueOnce({ title: 'Fix bug', status: 'open', sourceBranch: 'fix/bug', baseBranch: 'main' })
      .mockResolvedValueOnce([{ cycleNumber: 2, status: 'pending-review' }]);

    await program.parseAsync(['node', 'test', 'status', 'pr-1']);

    expect(logSpy).toHaveBeenCalledWith('PR: Fix bug');
    expect(logSpy).toHaveBeenCalledWith('Status: open');
    expect(logSpy).toHaveBeenCalledWith('Branch: fix/bug -> main');
    expect(logSpy).toHaveBeenCalledWith('Review Cycle: 2 (pending-review)');
  });

  it('handles empty cycles', async () => {
    client.get
      .mockResolvedValueOnce({ title: 'New PR', status: 'open', sourceBranch: 'feat/new', baseBranch: 'main' })
      .mockResolvedValueOnce([]);

    await program.parseAsync(['node', 'test', 'status', 'pr-1']);

    expect(logSpy).toHaveBeenCalledWith('Review Cycle: 0 (none)');
  });
});
