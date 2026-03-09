import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../index.js';
import type { AgentAdapter, AgentSession } from '../types.js';
import type { AppDatabase } from '../../db/index.js';
import type * as schemaModule from '../../db/schema.js';

const noop = () => {
  /* default callback placeholder */
};

function createMockAdapter(session?: Partial<AgentSession>): AgentAdapter {
  const mockSession: AgentSession = {
    id: 'sess-1',
    onComplete: vi.fn(),
    onError: vi.fn(),
    onOutput: vi.fn(),
    kill: vi.fn(() => Promise.resolve()),
    ...session,
  };
  return {
    name: 'test',
    startSession: vi
      .fn<AgentAdapter['startSession']>()
      .mockResolvedValue(mockSession),
  };
}

function createMockDatabase() {
  const pr = {
    id: 'pr-1',
    projectId: 'proj-1',
    title: 'Test PR',
    sourceBranch: 'feat/x',
    workingDirectory: undefined,
    agentContext: undefined,
  };
  const project = { id: 'proj-1', path: '/tmp/project', name: 'Test' };
  const cycle = {
    id: 'cycle-1',
    prId: 'pr-1',
    cycleNumber: 1,
    status: 'changes_requested',
  };

  const whereResult = { get: vi.fn(() => pr), all: vi.fn(() => [cycle]) };
  const updateWhereResult = { run: vi.fn() };

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => whereResult),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => updateWhereResult),
      })),
    })),
    _pr: pr,
    _project: project,
    _cycle: cycle,
  };
}

const mockSchema = {
  pullRequests: { id: 'pullRequests.id', projectId: 'pullRequests.projectId' },
  projects: { id: 'projects.id' },
  reviewCycles: { id: 'reviewCycles.id', prId: 'reviewCycles.prId' },
  comments: { reviewCycleId: 'comments.reviewCycleId' },
  insights: { prId: 'insights.prId' },
} as unknown as typeof schemaModule;

describe('Orchestrator (thin coordinator)', () => {
  let adapter: AgentAdapter;
  let database: ReturnType<typeof createMockDatabase>;
  let broadcast: ReturnType<
    typeof vi.fn<(event: string, data: unknown) => void>
  >;

  beforeEach(() => {
    adapter = createMockAdapter();
    database = createMockDatabase();
    broadcast = vi.fn<(event: string, data: unknown) => void>();
  });

  it('runInsights delegates to InsightsAnalyzer', async () => {
    const orchestrator = new Orchestrator({
      db: database as unknown as AppDatabase,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: {
        name: 'mock',
        findSessions: vi.fn<() => Promise<[]>>().mockResolvedValue([]),
      },
    });

    await expect(orchestrator.runInsights('pr-1')).resolves.toBeUndefined();
  });

  it('cancelAgent with source cancels only that source', async () => {
    const orchestrator = new Orchestrator({
      db: database as unknown as AppDatabase,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: {
        name: 'mock',
        findSessions: vi.fn<() => Promise<[]>>().mockResolvedValue([]),
      },
    });

    await orchestrator.cancelAgent('pr-1', 'insights');

    expect(broadcast).toHaveBeenCalledWith('agent:cancelled', {
      prId: 'pr-1',
      source: 'insights',
    });
    const calls = broadcast.mock.calls.filter(
      (c) =>
        c[0] === 'agent:cancelled' &&
        (c[1] as { source?: string }).source === 'code-fix',
    );
    expect(calls).toHaveLength(0);
  });

  it('cancelAgent without source cancels both sources', async () => {
    const orchestrator = new Orchestrator({
      db: database as unknown as AppDatabase,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: {
        name: 'mock',
        findSessions: vi.fn<() => Promise<[]>>().mockResolvedValue([]),
      },
    });

    await orchestrator.cancelAgent('pr-1');

    const cancelledEvents = broadcast.mock.calls.filter(
      (c) => c[0] === 'agent:cancelled',
    );
    expect(cancelledEvents).toHaveLength(2);
    const sources: string[] = cancelledEvents.map(
      (c) => (c[1] as { source: string }).source,
    );
    expect(sources).toEqual(expect.arrayContaining(['code-fix', 'insights']));
  });

  it('handleRequestChanges swallows insights errors', async () => {
    const failingProvider = {
      name: 'failing',
      findSessions: vi
        .fn<() => Promise<never>>()
        .mockRejectedValue(new Error('provider error')),
    };

    const orchestrator = new Orchestrator({
      db: database as unknown as AppDatabase,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: failingProvider,
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(noop);

    try {
      await orchestrator.handleRequestChanges('pr-1');
    } catch {
      // FeedbackIntegrator may throw — that's expected with our minimal mock
    }

    const insightsErrorCalls = consoleSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('Insights'),
    );
    expect(insightsErrorCalls.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
