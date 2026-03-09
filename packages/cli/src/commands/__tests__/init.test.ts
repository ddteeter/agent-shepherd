import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { initCommand } from '../init.js';
import type { ApiClient } from '../../api-client.js';

describe('initCommand', () => {
  let program: Command;
  let client: { post: ReturnType<typeof vi.fn> };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    client = {
      post: vi.fn(),
    };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      return;
    });
    initCommand(program, client as unknown as ApiClient);
  });

  it('registers a project with default name from path basename', async () => {
    client.post.mockResolvedValue({ name: 'myproject', id: 'uuid-1' });
    await program.parseAsync(['node', 'test', 'init', '/tmp/myproject']);

    expect(client.post).toHaveBeenCalledWith('/api/projects', {
      name: 'myproject',
      path: '/tmp/myproject',
      baseBranch: 'main',
    });
    expect(logSpy).toHaveBeenCalledWith(
      'Project registered: myproject (uuid-1)',
    );
  });

  it('uses custom name and base branch', async () => {
    client.post.mockResolvedValue({ name: 'custom', id: 'uuid-2' });
    await program.parseAsync([
      'node',
      'test',
      'init',
      '/tmp/proj',
      '-n',
      'custom',
      '-b',
      'develop',
    ]);

    expect(client.post).toHaveBeenCalledWith('/api/projects', {
      name: 'custom',
      path: '/tmp/proj',
      baseBranch: 'develop',
    });
  });

  it('defaults to cwd when no path provided', async () => {
    client.post.mockResolvedValue({ name: 'test', id: 'uuid-3' });
    await program.parseAsync(['node', 'test', 'init']);

    expect(client.post).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        baseBranch: 'main',
      }),
    );
  });
});
