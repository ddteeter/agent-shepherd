import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { startCommand } from '../start.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../paths.js', () => ({
  BACKEND_DIST: '/mock/packages/backend/dist',
  FRONTEND_DIST: '/mock/packages/frontend/dist',
}));

import { existsSync } from 'node:fs';

describe('startCommand', () => {
  let program: Command;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {
      return;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {
      return;
    });
    startCommand(program);
  });

  it('exits if backend not built', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await program.parseAsync(['node', 'test', 'start']);

    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('warns when frontend not built', () => {
    vi.mocked(existsSync).mockImplementation(((filePath: string | URL) =>
      String(filePath).includes('server.js')) as typeof existsSync);

    expect(existsSync('/mock/packages/backend/dist/server.js')).toBe(true);
    expect(existsSync('/mock/packages/frontend/dist')).toBe(false);
  });
});
