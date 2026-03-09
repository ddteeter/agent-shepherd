import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { setupCommand } from '../setup.js';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../../paths.js', () => ({
  PACKAGE_ROOT: '/mock/root',
  isDevelopmentMode: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { isDevelopmentMode } from '../../paths.js';

describe('setupCommand', () => {
  let program: Command;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    setupCommand(program);
  });

  it('succeeds when all steps pass (non-dev mode)', async () => {
    vi.mocked(execSync).mockReturnValue('1.0.0');
    vi.mocked(isDevelopmentMode).mockReturnValue(false);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OK] Claude CLI'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OK] Skills install'),
    );
    expect(logSpy).toHaveBeenCalledWith('\nSetup complete!');
  });

  it('reports failure when claude CLI not found', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('claude --version'))
        throw new Error('not found');
      return '';
    });
    vi.mocked(isDevelopmentMode).mockReturnValue(false);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[FAIL] Claude CLI'),
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('runs npm link in dev mode', async () => {
    vi.mocked(execSync).mockReturnValue('1.0.0');
    vi.mocked(isDevelopmentMode).mockReturnValue(true);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(execSync).toHaveBeenCalledWith(
      'npm link',
      expect.objectContaining({ cwd: '/mock/root' }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[OK] npm link (dev)'),
    );
  });

  it('reports npm link failure in dev mode', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm link'))
        throw new Error('permission denied');
      return '1.0.0';
    });
    vi.mocked(isDevelopmentMode).mockReturnValue(true);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[FAIL] npm link (dev)'),
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('reports skills install failure', async () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npx skills'))
        throw new Error('failed');
      return '1.0.0';
    });
    vi.mocked(isDevelopmentMode).mockReturnValue(false);

    await program.parseAsync(['node', 'test', 'setup']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[FAIL] Skills install'),
    );
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});
