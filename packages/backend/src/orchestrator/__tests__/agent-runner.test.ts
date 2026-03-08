import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from '../agent-runner.js';
import type {
  AgentAdapter,
  AgentSession,
  AgentActivityEntry,
} from '../types.js';

function createMockSession(id = 'session-1'): AgentSession & {
  _onComplete: () => void;
  _onError: (error: Error) => void;
  _onOutput: (entry: AgentActivityEntry) => void;
} {
  let onComplete: () => void = () => {};
  let onError: (error: Error) => void = () => {};
  let onOutput: (entry: AgentActivityEntry) => void = () => {};

  return {
    id,
    onComplete: vi.fn((cb) => {
      onComplete = cb;
    }),
    onError: vi.fn((cb) => {
      onError = cb;
    }),
    onOutput: vi.fn((cb) => {
      onOutput = cb;
    }),
    kill: vi.fn(async () => {}),
    get _onComplete() {
      return onComplete;
    },
    get _onError() {
      return onError;
    },
    get _onOutput() {
      return onOutput;
    },
  };
}

function createMockAdapter(session: AgentSession): AgentAdapter {
  return {
    name: 'mock',
    startSession: vi.fn(async () => session),
  };
}

describe('AgentRunner', () => {
  let broadcast: ReturnType<
    typeof vi.fn<(event: string, data: unknown) => void>
  >;

  beforeEach(() => {
    broadcast = vi.fn<(event: string, data: unknown) => void>();
  });

  it('spawns agent and tracks session (hasActiveSession returns true)', async () => {
    const session = createMockSession();
    const adapter = createMockAdapter(session);
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
    expect(adapter.startSession).toHaveBeenCalledWith({
      projectPath: '/tmp',
      prompt: 'fix bugs',
    });
    expect(broadcast).toHaveBeenCalledWith('agent:working', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('supports two sessions for same PR with different sources', async () => {
    const session1 = createMockSession('s1');
    const session2 = createMockSession('s2');
    const adapter: AgentAdapter = {
      name: 'mock',
      startSession: vi
        .fn()
        .mockResolvedValueOnce(session1)
        .mockResolvedValueOnce(session2),
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
    const session = createMockSession();
    const adapter = createMockAdapter(session);
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
    session._onOutput(entry);

    expect(broadcast).toHaveBeenCalledWith('agent:output', {
      prId: 'pr-1',
      source: 'code-fix',
      entry,
    });
  });

  it('cancel kills session and removes from tracking', async () => {
    const session = createMockSession();
    const adapter = createMockAdapter(session);
    const runner = new AgentRunner({ adapter, broadcast });

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError: vi.fn() },
    );

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(true);

    await runner.cancel('pr-1', 'code-fix');

    expect(session.kill).toHaveBeenCalled();
    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(broadcast).toHaveBeenCalledWith('agent:cancelled', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('cleans up session on complete and calls callback', async () => {
    const session = createMockSession();
    const adapter = createMockAdapter(session);
    const runner = new AgentRunner({ adapter, broadcast });
    const onComplete = vi.fn();

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete, onError: vi.fn() },
    );

    session._onComplete();

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(onComplete).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('agent:completed', {
      prId: 'pr-1',
      source: 'code-fix',
    });
  });

  it('cleans up session on error and calls callback', async () => {
    const session = createMockSession();
    const adapter = createMockAdapter(session);
    const runner = new AgentRunner({ adapter, broadcast });
    const onError = vi.fn();
    const error = new Error('something went wrong');

    await runner.run(
      { prId: 'pr-1', projectPath: '/tmp', prompt: 'fix', source: 'code-fix' },
      { onComplete: vi.fn(), onError },
    );

    session._onError(error);

    expect(runner.hasActiveSession('pr-1', 'code-fix')).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(broadcast).toHaveBeenCalledWith('agent:error', {
      prId: 'pr-1',
      source: 'code-fix',
      error: 'something went wrong',
    });
  });
});
