import { describe, it, expect, vi } from 'vitest';
import { InsightsAnalyzer } from '../insights-analyzer.js';
import type { AgentRunner } from '../../agent-runner.js';
import type { AgentRunConfig, AgentRunCallbacks } from '../../types.js';
import type {
  SessionLogProvider,
  SessionLog,
} from '../../session-log/provider.js';
import type { AppDatabase } from '../../../db/index.js';
import type * as schemaModule from '../../../db/schema.js';

vi.mock('../transcript-formatter.js', () => ({
  formatTranscript: vi.fn((...arguments_: [SessionLog, string]) =>
    Promise.resolve(`/tmp/formatted/${arguments_[0].sessionId}.md`),
  ),
}));

function createMockRunner() {
  const runMock = vi
    .fn<
      (config: AgentRunConfig, callbacks: AgentRunCallbacks) => Promise<void>
    >()
    .mockImplementation(() => Promise.resolve());
  const cancelMock = vi.fn(() => Promise.resolve());
  const hasActiveSessionMock = vi.fn(() => false);
  const runner = {
    run: runMock,
    cancel: cancelMock,
    hasActiveSession: hasActiveSessionMock,
  } as unknown as AgentRunner;
  return { runner, runMock };
}

function createMockSessionLogProvider(sessions: SessionLog[] = []) {
  const findSessionsMock = vi
    .fn<() => Promise<SessionLog[]>>()
    .mockResolvedValue(sessions);
  const provider: SessionLogProvider = {
    name: 'mock',
    findSessions: findSessionsMock,
  };
  return { provider, findSessionsMock };
}

interface MockDatabaseOptions {
  pr?: {
    id: string;
    projectId: string;
    title: string;
    sourceBranch: string;
    workingDirectory?: string;
  };
  project?: { id: string; path: string; name: string };
  insights?: { id: string; prId: string; updatedAt: string };
}

function createMockDatabase(options?: MockDatabaseOptions) {
  const pr =
    options !== undefined && 'pr' in options
      ? options.pr
      : {
          id: 'pr-1',
          projectId: 'proj-1',
          title: 'Test PR',
          sourceBranch: 'feat/x',
          workingDirectory: '/tmp/worktree',
        };
  const project =
    options !== undefined && 'project' in options
      ? options.project
      : { id: 'proj-1', path: '/tmp/project', name: 'Test' };
  const insightsRow =
    options !== undefined && 'insights' in options
      ? options.insights
      : undefined;

  let callCount = 0;
  const getHandler = vi.fn(() => {
    callCount++;
    if (callCount === 1) return pr;
    if (callCount === 2) return project;
    return insightsRow;
  });

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: getHandler })),
      })),
    })),
    _pr: pr,
    _project: project,
  };
}

const mockSchemaStub = {
  pullRequests: {},
  projects: {},
  insights: {},
} as unknown as typeof schemaModule;

describe('InsightsAnalyzer', () => {
  it('discovers session logs, formats them, and spawns agent', async () => {
    const { runner, runMock } = createMockRunner();
    const { provider: sessionLogProvider, findSessionsMock } =
      createMockSessionLogProvider([
        {
          sessionId: 's1',
          filePath: '/path/to/s1.jsonl',
          startedAt: '2026-01-01',
          branch: 'feat/x',
        },
      ]);

    const database = createMockDatabase();

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(findSessionsMock).toHaveBeenCalled();

    const { formatTranscript } = await import('../transcript-formatter.js');
    expect(formatTranscript).toHaveBeenCalledWith(
      {
        sessionId: 's1',
        filePath: '/path/to/s1.jsonl',
        startedAt: '2026-01-01',
        branch: 'feat/x',
      },
      expect.stringContaining('transcripts'),
    );

    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.prompt).toContain('/tmp/formatted/s1.md');
    expect(runConfig.prompt).not.toContain('s1.jsonl');

    expect(runConfig.additionalDirs).toEqual([
      expect.stringContaining('transcripts'),
    ]);

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });

  it('throws when PR is not found', async () => {
    const database = createMockDatabase({ pr: undefined });
    const { runner } = createMockRunner();
    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await expect(analyzer.run('nonexistent')).rejects.toThrow('PR not found');
  });

  it('throws when project is not found', async () => {
    const database = createMockDatabase({ project: undefined });
    const { runner } = createMockRunner();
    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await expect(analyzer.run('pr-1')).rejects.toThrow('Project not found');
  });

  it('spawns agent even with empty session logs', async () => {
    const { runner, runMock } = createMockRunner();
    const { provider: sessionLogProvider } = createMockSessionLogProvider([]);
    const database = createMockDatabase();

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-1', source: 'insights' }),
      expect.any(Object),
    );
  });

  it('uses workingDirectory when available, falls back to project.path', async () => {
    const { runner, runMock } = createMockRunner();
    const database = createMockDatabase();

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await analyzer.run('pr-1');

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/tmp/worktree' }),
      expect.any(Object),
    );
  });

  it('passes workingDirectory to findSessions when available', async () => {
    const { runner } = createMockRunner();
    const { provider: sessionLogProvider, findSessionsMock } =
      createMockSessionLogProvider();
    const database = createMockDatabase(); // default PR has workingDirectory: '/tmp/worktree'

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(findSessionsMock).toHaveBeenCalledWith({
      projectPath: '/tmp/worktree',
      branch: 'feat/x',
    });
  });

  it('passes project.path to findSessions when workingDirectory is null', async () => {
    const { runner } = createMockRunner();
    const { provider: sessionLogProvider, findSessionsMock } =
      createMockSessionLogProvider();
    const database = createMockDatabase({
      pr: {
        id: 'pr-1',
        projectId: 'proj-1',
        title: 'Test',
        sourceBranch: 'feat/x',
        workingDirectory: undefined,
      },
    });

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider,
    });

    await analyzer.run('pr-1');

    expect(findSessionsMock).toHaveBeenCalledWith({
      projectPath: '/tmp/project',
      branch: 'feat/x',
    });
  });

  it('falls back to project.path when workingDirectory is null', async () => {
    const { runner, runMock } = createMockRunner();
    const database = createMockDatabase({
      pr: {
        id: 'pr-1',
        projectId: 'proj-1',
        title: 'Test',
        sourceBranch: 'feat/x',
        workingDirectory: undefined,
      },
    });

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await analyzer.run('pr-1');

    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: '/tmp/project' }),
      expect.any(Object),
    );
  });

  it('passes previousUpdatedAt to prompt when insights exist', async () => {
    const { runner, runMock } = createMockRunner();
    const database = createMockDatabase({
      insights: {
        id: 'ins-1',
        prId: 'pr-1',
        updatedAt: '2026-03-07T10:00:00Z',
      },
    });

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await analyzer.run('pr-1');

    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.prompt).toContain('2026-03-07T10:00:00Z');
    expect(runConfig.prompt).toContain('Incremental Analysis');
  });

  it('omits previousUpdatedAt when no prior insights exist', async () => {
    const { runner, runMock } = createMockRunner();
    const database = createMockDatabase();

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await analyzer.run('pr-1');

    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.prompt).not.toContain('Incremental Analysis');
  });

  it('does not throw when agentRunner.run fails (non-critical)', async () => {
    const { runner, runMock } = createMockRunner();
    runMock.mockRejectedValue(new Error('spawn failed'));
    const database = createMockDatabase();

    const analyzer = new InsightsAnalyzer({
      db: database as unknown as AppDatabase,
      schema: mockSchemaStub,
      agentRunner: runner,
      sessionLogProvider: createMockSessionLogProvider().provider,
    });

    await expect(analyzer.run('pr-1')).resolves.toBeUndefined();
  });
});
