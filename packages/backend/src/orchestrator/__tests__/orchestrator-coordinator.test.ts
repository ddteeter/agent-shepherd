import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Orchestrator } from '../index.js';
import type { AgentAdapter, AgentSession } from '../types.js';

function createMockAdapter(session?: Partial<AgentSession>): AgentAdapter {
  const mockSession: AgentSession = {
    id: 'sess-1',
    onComplete: vi.fn(),
    onError: vi.fn(),
    onOutput: vi.fn(),
    kill: vi.fn(async () => {}),
    ...session,
  };
  return {
    name: 'test',
    startSession: vi.fn(async () => mockSession),
  };
}

function createMockDb() {
  const pr = {
    id: 'pr-1',
    projectId: 'proj-1',
    title: 'Test PR',
    sourceBranch: 'feat/x',
    workingDirectory: null,
    agentContext: null,
  };
  const project = { id: 'proj-1', path: '/tmp/project', name: 'Test' };
  const cycle = { id: 'cycle-1', prId: 'pr-1', cycleNumber: 1, status: 'changes_requested' };
  const comments: any[] = [];

  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => pr),
          all: vi.fn(() => [cycle]),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          run: vi.fn(),
        })),
      })),
    })),
    _pr: pr,
    _project: project,
    _cycle: cycle,
  };
}

// Minimal schema stubs
const mockSchema = {
  pullRequests: { id: 'pullRequests.id', projectId: 'pullRequests.projectId' },
  projects: { id: 'projects.id' },
  reviewCycles: { id: 'reviewCycles.id', prId: 'reviewCycles.prId' },
  comments: { reviewCycleId: 'comments.reviewCycleId' },
  insights: { prId: 'insights.prId' },
} as any;

describe('Orchestrator (thin coordinator)', () => {
  let adapter: AgentAdapter;
  let db: ReturnType<typeof createMockDb>;
  let broadcast: ReturnType<typeof vi.fn<(event: string, data: any) => void>>;

  beforeEach(() => {
    adapter = createMockAdapter();
    db = createMockDb();
    broadcast = vi.fn<(event: string, data: any) => void>();
  });

  it('runInsights delegates to InsightsAnalyzer', async () => {
    const orchestrator = new Orchestrator({
      db,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: { name: 'mock', findSessions: vi.fn(async () => []) },
    });

    // runInsights should not throw (InsightsAnalyzer catches runner errors)
    await expect(orchestrator.runInsights('pr-1')).resolves.toBeUndefined();
  });

  it('cancelAgent with source cancels only that source', async () => {
    const orchestrator = new Orchestrator({
      db,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: { name: 'mock', findSessions: vi.fn(async () => []) },
    });

    await orchestrator.cancelAgent('pr-1', 'insights');

    // Should broadcast cancelled for insights only
    expect(broadcast).toHaveBeenCalledWith('agent:cancelled', { prId: 'pr-1', source: 'insights' });
    // Should NOT broadcast for code-fix
    const calls = broadcast.mock.calls.filter(
      (c: any[]) => c[0] === 'agent:cancelled' && c[1]?.source === 'code-fix'
    );
    expect(calls).toHaveLength(0);
  });

  it('cancelAgent without source cancels both sources', async () => {
    const orchestrator = new Orchestrator({
      db,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: { name: 'mock', findSessions: vi.fn(async () => []) },
    });

    await orchestrator.cancelAgent('pr-1');

    const cancelledEvents = broadcast.mock.calls.filter(
      (c: any[]) => c[0] === 'agent:cancelled'
    );
    expect(cancelledEvents).toHaveLength(2);
    const sources = cancelledEvents.map((c: any[]) => c[1].source).sort();
    expect(sources).toEqual(['code-fix', 'insights']);
  });

  it('handleRequestChanges swallows insights errors', async () => {
    // Create an orchestrator with a session log provider that throws
    const failingProvider = {
      name: 'failing',
      findSessions: vi.fn(async () => { throw new Error('provider error'); }),
    };

    const orchestrator = new Orchestrator({
      db,
      schema: mockSchema,
      broadcast,
      adapter,
      sessionLogProvider: failingProvider,
    });

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // handleRequestChanges calls both modules in parallel.
    // FeedbackIntegrator will also fail (mock DB doesn't support full query chain),
    // but we're testing that insights errors don't propagate separately.
    // The .catch on insightsPromise inside handleRequestChanges should swallow the insights error.
    try {
      await orchestrator.handleRequestChanges('pr-1');
    } catch {
      // FeedbackIntegrator may throw — that's expected with our minimal mock
    }

    // Verify the insights error was logged (not thrown)
    const insightsErrorCalls = consoleSpy.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('Insights')
    );
    expect(insightsErrorCalls.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });
});
