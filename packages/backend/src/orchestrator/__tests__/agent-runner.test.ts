import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../agent-runner.js';
import type {
  AgentAdapter,
  AgentSession,
  AgentActivityEntry,
} from '../types.js';

const noop = () => {
  /* default callback placeholder */
};

function createMockSession(id = 'session-1') {
  let onComplete: () => void = noop;
  let onError: (error: Error) => void = noop;
  let onOutput: (entry: AgentActivityEntry) => void = noop;

  const killMock = vi.fn(() => Promise.resolve());

  const session: AgentSession = {
    id,
    onComplete: vi.fn((callback: () => void) => {
      onComplete = callback;
    }),
    onError: vi.fn((callback: (error: Error) => void) => {
      onError = callback;
    }),
    onOutput: vi.fn((callback: (entry: AgentActivityEntry) => void) => {
      onOutput = callback;
    }),
    kill: killMock,
  };

  return {
    session,
    killMock,
    triggerComplete() {
      onComplete();
    },
    triggerError(error: Error) {
      onError(error);
    },
    triggerOutput(entry: AgentActivityEntry) {
      onOutput(entry);
    },
  };
}

function createMockAdapter(session: AgentSession) {
  const startSessionMock = vi
    .fn<AgentAdapter['startSession']>()
    .mockResolvedValue(session);
  const adapter: AgentAdapter = {
    name: 'mock',
    startSession: startSessionMock,
  };
  return { adapter, startSessionMock };
}

describe('AgentRunner', () => {
  let broadcast: ReturnType<
    typeof vi.fn<(event: string, data: unknown) => void>
  >;

  beforeEach(() => {
    broadcast = vi.fn<(event: string, data: unknown) => void>();
  });

  it('spawns agent and tracks session (hasActiveSession returns true)', async () => {
    const mock = createMockSession();
    const { adapter, startSessionMock } = createMockAdapter(mock.session);
    const runner = new AgentRunner({ adapter, broadcast });

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);

    await runner.run(
      {
        prId: 'pr-1',
        projectPath: '/tmp',
        prompt: 'fix bugs',
        source: 'code-fix',
      },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);
    expect(startSessionMock).toHaveBeenCalledWith({
      projectPath: '/tmp',
      prompt: 'fix bugs',
    });
    expect(broadcast).toHaveBeenCalledWith('agent:working', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('supports two sessions for same PR with different sources', async () => {
    const mock1 = createMockSession('s1');
    const mock2 = createMockSession('s2');
    const adapter: AgentAdapter = {
      name: 'mock',
      startSession: vi
        .fn<AgentAdapter['startSession']>()
        .mockResolvedValueOnce(mock1.session)
        .mockResolvedValueOnce(mock2.session),
    };
    const runner = new AgentRunner({ adapter, broadcast });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );
    await runner.run(
      {
        prId: 'pr-1',
        projectPath: '/tmp',
        prompt: 'analyze',
        source: 'insights',
      },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);
    expect(runner.hasActiveSession('pr-1', 'insights')).toBe(true);
  });

  it('broadcasts output with source field', async () => {
    const mock = createMockSession();
    const { adapter } = createMockAdapter(mock.session);
    const runner = new AgentRunner({ adapter, broadcast });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    const entry: AgentActivityEntry = {
      timestamp: new Date().toISOString(),
      type: 'tool_use',
      summary: 'Editing file',
    };
    mock.triggerOutput(entry);

    expect(broadcast).toHaveBeenCalledWith('agent:output', {
      prId: 'pr-1',
      source: 'code-fix',
      entry,
    });
  });

  it('cancel kills session and removes from tracking', async () => {
    const mock = createMockSession();
    const { adapter } = createMockAdapter(mock.session);
    const runner = new AgentRunner({ adapter, broadcast });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);

    await runner.cancel('pr-1', 'code-fix');

    expect(mock.killMock).toHaveBeenCalled();
    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(broadcast).toHaveBeenCalledWith('agent:cancelled', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('cleans up session on complete and calls callback', async () => {
    const mock = createMockSession();
    const { adapter } = createMockAdapter(mock.session);
    const runner = new AgentRunner({ adapter, broadcast });
    const onComplete = vi.fn();

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete, onError: vi.fn() },
    );

    mock.triggerComplete();

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(onComplete).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('agent:completed', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('cleans up session on error and calls callback', async () => {
    const mock = createMockSession();
    const { adapter } = createMockAdapter(mock.session);
    const runner = new AgentRunner({ adapter, broadcast });
    const onError = vi.fn();
    const error = new Error('something went wrong');

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError },
    );

    mock.triggerError(error);

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(broadcast).toHaveBeenCalledWith('agent:error', {
      prId: 'pr-1',
      source: 'code-fix',
      error: 'something went wrong',
    });
  });
});
