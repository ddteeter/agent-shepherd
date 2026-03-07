import { describe, it, expect, vi } from 'vitest';
import { InsightsAnalyzer } from '../insights-analyzer.js';
import type { AgentRunner } from '../../agent-runner.js';
import type { SessionLogProvider } from '../../session-log/provider.js';

vi.mock('../transcript-formatter.js', () => ({
  formatTranscript: vi.fn(async (session: any, _outputDir: string) =>
    `/tmp/formatted/${session.sessionId}.md`
  ),
}));

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

function createMockDb(opts?: { pr?: any; project?: any; insights?: any }) {
  const pr = opts !== undefined && 'pr' in opts ? opts.pr : { id: 'pr-1', projectId: 'proj-1', title: 'Test PR', sourceBranch: 'feat/x', workingDirectory: '/tmp/worktree' };
  const project = opts !== undefined && 'project' in opts ? opts.project : { id: 'proj-1', path: '/tmp/project', name: 'Test' };
  const insightsRow = opts !== undefined && 'insights' in opts ? opts.insights : null;

  let callCount = 0;
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => {
            callCount++;
            if (callCount === 1) return pr;
            if (callCount === 2) return project;
            return insightsRow;
          }),
        })),
      })),
    })),
    _pr: pr,
    _project: project,
  };
}

describe('InsightsAnalyzer', () => {
  it('discovers session logs, formats them, and spawns agent', async () => {
    const runner = createMockRunner();
    const sessionLogProvider = createMockSessionLogProvider([
      { sessionId: 's1', filePath: '/path/to/s1.jsonl', startedAt: '2026-01-01', branch: 'feat/x' },
    ]);

    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(sessionLogProvider.findSessions).toHaveBeenCalled();

    // Verify formatTranscript was called
    const { formatTranscript } = await import('../transcript-formatter.js');
    expect(formatTranscript).toHaveBeenCalledWith(
      { sessionId: 's1', filePath: '/path/to/s1.jsonl', startedAt: '2026-01-01', branch: 'feat/x' },
      expect.stringContaining('transcripts'),
    );

    // Verify the prompt includes formatted paths (not raw JSONL paths)
    const runCall = (runner.run as any).mock.calls[0];
    expect(runCall[0].prompt).toContain('/tmp/formatted/s1.md');
    expect(runCall[0].prompt).not.toContain('s1.jsonl');

    // Verify additionalDirs is passed so the agent sandbox can access transcript files
    expect(runCall[0].additionalDirs).toEqual([expect.stringContaining('transcripts')]);

    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });

  it('throws when PR is not found', async () => {
    const db = createMockDb({ pr: null });
    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
      agentRunner: createMockRunner(),
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await expect(analyzer.run('nonexistent')).rejects.toThrow('PR not found');
  });

  it('throws when project is not found', async () => {
    const db = createMockDb({ project: null });
    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
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
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
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
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
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
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
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

  it('passes previousUpdatedAt to prompt when insights exist', async () => {
    const runner = createMockRunner();
    const db = createMockDb({
      insights: { id: 'ins-1', prId: 'pr-1', updatedAt: '2026-03-07T10:00:00Z' },
    });

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await analyzer.run('pr-1');

    const runCall = (runner.run as any).mock.calls[0];
    expect(runCall[0].prompt).toContain('2026-03-07T10:00:00Z');
    expect(runCall[0].prompt).toContain('Incremental Analysis');
  });

  it('omits previousUpdatedAt when no prior insights exist', async () => {
    const runner = createMockRunner();
    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    await analyzer.run('pr-1');

    const runCall = (runner.run as any).mock.calls[0];
    expect(runCall[0].prompt).not.toContain('Incremental Analysis');
  });

  it('does not throw when agentRunner.run fails (non-critical)', async () => {
    const runner = createMockRunner();
    (runner.run as any).mockRejectedValue(new Error('spawn failed'));
    const db = createMockDb();

    const analyzer = new InsightsAnalyzer({
      db,
      schema: { pullRequests: {}, projects: {}, insights: {} } as any,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider(),
    });

    // Should not throw — error is caught internally
    await expect(analyzer.run('pr-1')).resolves.toBeUndefined();
  });
});
