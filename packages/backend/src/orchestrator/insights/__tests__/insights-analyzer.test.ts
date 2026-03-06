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

function createMockDb() {
  const pr = { id: 'pr-1', projectId: 'proj-1', title: 'Test PR', sourceBranch: 'feat/x', workingDirectory: '/tmp/worktree' };
  const project = { id: 'proj-1', path: '/tmp/project', name: 'Test' };

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
});
