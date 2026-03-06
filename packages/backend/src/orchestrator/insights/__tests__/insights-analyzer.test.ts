import { describe, it, expect, vi } from 'vitest';
import { InsightsAnalyzer } from '../insights-analyzer.js';
import type { AgentRunner } from '../../agent-runner.js';
import type { SessionLogProvider } from '../../session-log/provider.js';

function createMockRunner(): AgentRunner {
  return {
    run: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    hasActiveSession: vi.fn(() => false),
  } as any;
}

function createMockSessionLogProvider(sessions: any[] = []): SessionLogProvider {
  return {
    name: 'mock',
    findSessions: vi.fn(async () => sessions),
  };
}

function createMockDb(opts?: { pr?: any; project?: any }) {
  const pr = opts !== undefined && 'pr' in opts ? opts.pr : { id: 'pr-1', projectId: 'proj-1', title: 'Test PR', sourceBranch: 'feat/x', workingDirectory: '/tmp/worktree' };
  const project = opts !== undefined && 'project' in opts ? opts.project : { id: 'proj-1', path: '/tmp/project', name: 'Test' };

  let callCount = 0;
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => {
            callCount++;
            return callCount === 1 ? pr : project;
          }),
        })),
      })),
    })),
    _pr: pr,
    _project: project,
  };
}

describe('InsightsAnalyzer', () => {
  it('discovers session logs and spawns agent', async () => {
    const runner = createMockRunner();
    const sessionLogProvider = createMockSessionLogProvider([
      { sessionId: 's1', filePath: '/path/to/s1.jsonl', startedAt: '2026-01-01', branch: 'feat/x' },
    ]);

    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(sessionLogProvider.findSessions).toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });

  it('throws when PR is not found', async () => {
    const db = createMockDb({ pr: null });
    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: createMockRunner(),
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await expect(analyzer.run('nonexistent')).rejects.toThrow('PR not found');
  });

  it('throws when project is not found', async () => {
    const db = createMockDb({ project: null });
    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: createMockRunner(),
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await expect(analyzer.run('pr-1')).rejects.toThrow('Project not found');
  });

  it('spawns agent even with empty session logs', async () => {
    const runner = createMockRunner();
    const sessionLogProvider = createMockSessionLogProvider([]);
    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });

  it('uses workingDirectory when available, falls back to project.path', async () => {
    const runner = createMockRunner();
    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await analyzer.run('pr-1');

    // workingDirectory is '/tmp/worktree' on the mock PR
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/tmp/worktree' }),
      expect.any(Object),
    );
  });

  it('falls back to project.path when workingDirectory is null', async () => {
    const runner = createMockRunner();
    const db = createMockDb({
      pr: { id: 'pr-1', projectId: 'proj-1', title: 'Test', sourceBranch: 'feat/x', workingDirectory: null },
    });

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await analyzer.run('pr-1');

    // Should fall back to project.path '/tmp/project'
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/tmp/project' }),
      expect.any(Object),
    );
  });

  it('does not throw when agentRunner.run fails (non-critical)', async () => {
    const runner = createMockRunner();
    (runner.run as any).mockRejectedValue(new Error('spawn failed'));
    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    // Should not throw — error is caught internally
    await expect(analyzer.run('pr-1')).resolves.toBeUndefined();
  });
});
