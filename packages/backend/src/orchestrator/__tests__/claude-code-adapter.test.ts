import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockWritable {
  end: ReturnType<typeof vi.fn>;
}

interface MockReadable {
  on(event: string, listener: (...arguments_: unknown[]) => void): void;
  emit(event: string, ...arguments_: unknown[]): boolean;
}

interface MockProcess {
  stdin: MockWritable;
  stdout: MockReadable;
  stderr: MockReadable;
  pid: number | undefined;
  kill: ReturnType<typeof vi.fn>;
  on(event: string, listener: (...arguments_: unknown[]) => void): void;
  emit(event: string, ...arguments_: unknown[]): boolean;
}

const mockSpawn = vi.fn<(...arguments_: unknown[]) => MockProcess>();
vi.mock('child_process', () => ({
  spawn: (...arguments_: unknown[]) => mockSpawn(...arguments_),
}));

const { ClaudeCodeAdapter } = await import('../claude-code-adapter.js');

function createEmitter(): MockReadable & {
  on: ReturnType<typeof vi.fn>;
  emit: (...arguments_: [string, ...unknown[]]) => boolean;
} {
  const listeners = new Map<string, ((...arguments_: unknown[]) => void)[]>();
  return {
    on: vi.fn((event: string, listener: (...arguments_: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    }),
    emit(event: string, ...arguments_: unknown[]) {
      const list = listeners.get(event) ?? [];
      for (const listener of list) listener(...arguments_);
      return list.length > 0;
    },
  };
}

function createMockProcess(): MockProcess {
  const stdin: MockWritable = { end: vi.fn() };
  const stdout = createEmitter();
  const stderr = createEmitter();
  const procEmitter = createEmitter();
  return {
    stdin,
    stdout,
    stderr,
    pid: 12_345 as number | undefined,
    kill: vi.fn(),
    on: procEmitter.on,
    emit: procEmitter.emit.bind(procEmitter),
  };
}

describe('ClaudeCodeAdapter', () => {
  let adapter: InstanceType<typeof ClaudeCodeAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeCodeAdapter();
  });

  it('has name "claude-code"', () => {
    expect(adapter.name).toBe('claude-code');
  });

  describe('startSession', () => {
    it('spawns claude with correct args and pipes prompt via stdin', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'Fix the bug',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          '--output-format',
          'stream-json',
          '--verbose',
          '-p',
        ]),
        expect.objectContaining({ cwd: '/tmp/project' }),
      );
      expect(proc.stdin.end).toHaveBeenCalledWith('Fix the bug');
      expect(session.id).toBe('12345');
    });

    it('passes additionalDirs as --add-dir arguments', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'Fix it',
        additionalDirs: ['/tmp/other', '/tmp/third'],
      });

      const spawnArguments = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArguments).toContain('--add-dir');
      const addDirectoryIndices: number[] = [];
      for (const [index, value] of spawnArguments.entries()) {
        if (value === '--add-dir') addDirectoryIndices.push(index);
      }
      expect(addDirectoryIndices).toHaveLength(2);
      expect(spawnArguments[addDirectoryIndices[0] + 1]).toBe('/tmp/other');
      expect(spawnArguments[addDirectoryIndices[1] + 1]).toBe('/tmp/third');
    });
  });

  describe('session callbacks', () => {
    it('calls onComplete when process exits with code 0 and stop_reason is not end_turn', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onComplete = vi.fn();
      session.onComplete(onComplete);

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: { stop_reason: 'tool_use', content: [] },
          }) + '\n',
        ),
      );

      proc.emit('exit', 0);
      expect(onComplete).toHaveBeenCalled();
    });

    it('calls onError when process exits with non-zero code', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onError = vi.fn();
      session.onError(onError);

      proc.stderr.emit('data', Buffer.from('some error'));
      proc.emit('exit', 1);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArgument = onError.mock.calls[0][0] as Error;
      expect(errorArgument.message).toContain('Claude Code exited with code 1');
      expect(errorArgument.message).toContain('some error');
    });

    it('calls onError with end_turn message when stop_reason is end_turn', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onError = vi.fn();
      session.onError(onError);

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: {
              stop_reason: 'end_turn',
              content: [{ type: 'text', text: 'I am done' }],
            },
          }) + '\n',
        ),
      );

      proc.emit('exit', 0);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArgument = onError.mock.calls[0][0] as Error;
      expect(errorArgument.message).toContain('end_turn');
      expect(errorArgument.message).toContain('I am done');
    });

    it('calls onError when process emits error event', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onError = vi.fn();
      session.onError(onError);

      proc.emit('error', new Error('spawn failed'));
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArgument = onError.mock.calls[0][0] as Error;
      expect(errorArgument.message).toBe('spawn failed');
    });

    it('emits tool_use entries via onOutput', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onOutput = vi.fn();
      session.onOutput(onOutput);

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'Read',
                  input: { file_path: 'src/index.ts' },
                },
              ],
            },
          }) + '\n',
        ),
      );

      expect(onOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'Read',
          summary: 'Reading src/index.ts',
        }),
      );
    });

    it('handles session ID from init message', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'system',
            subtype: 'init',
            session_id: 'sess-abc-123',
          }) + '\n',
        ),
      );

      expect(session.id).toBe('sess-abc-123');
    });

    it('kill sends SIGTERM', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      await session.kill();
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('handles exit code 0 with no stderr as empty detail', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onError = vi.fn();
      session.onError(onError);

      proc.emit('exit', 2);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      const errorArgument = onError.mock.calls[0][0] as Error;
      expect(errorArgument.message).toContain('no output captured');
    });

    it('ignores unparseable stdout lines', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onOutput = vi.fn();
      session.onOutput(onOutput);

      proc.stdout.emit('data', Buffer.from('not valid json\n'));
      expect(onOutput).not.toHaveBeenCalled();
    });

    it('skips empty lines', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onOutput = vi.fn();
      session.onOutput(onOutput);

      proc.stdout.emit('data', Buffer.from('\n\n\n'));
      expect(onOutput).not.toHaveBeenCalled();
    });

    it('handles end_turn with no last assistant text', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onError = vi.fn();
      session.onError(onError);

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: { stop_reason: 'end_turn', content: [] },
          }) + '\n',
        ),
      );

      proc.emit('exit', 0);
      expect(onError).toHaveBeenCalled();
      const errorArgument = onError.mock.calls[0][0] as Error;
      expect(errorArgument.message).not.toContain('Last message');
    });

    it('handles pid as undefined', async () => {
      const proc = createMockProcess();
      proc.pid = undefined;
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      expect(session.id).toBe('unknown');
    });
  });

  describe('summarizeToolUse', () => {
    it('summarizes various tool types', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const outputs: { type: string; summary: string }[] = [];
      session.onOutput((entry) => outputs.push(entry));

      const tools = [
        {
          name: 'Read',
          input: { file_path: 'a.ts' },
          expected: 'Reading a.ts',
        },
        {
          name: 'Edit',
          input: { file_path: 'b.ts' },
          expected: 'Editing b.ts',
        },
        {
          name: 'Write',
          input: { file_path: 'c.ts' },
          expected: 'Writing c.ts',
        },
        {
          name: 'Bash',
          input: { command: 'npm test' },
          expected: 'Running npm test',
        },
        {
          name: 'Grep',
          input: { pattern: 'foo' },
          expected: 'Searching for foo',
        },
        {
          name: 'Glob',
          input: { pattern: '*.ts' },
          expected: 'Finding files matching *.ts',
        },
        { name: 'Task', input: {}, expected: 'Dispatching sub-agent' },
        { name: 'Unknown', input: {}, expected: 'Using Unknown' },
        { name: 'Read', input: {}, expected: 'Reading file' },
        {
          name: 'Bash',
          input: { command: 'a'.repeat(100) },
          expected: `Running ${'a'.repeat(60)}...`,
        },
      ];

      for (const tool of tools) {
        proc.stdout.emit(
          'data',
          Buffer.from(
            JSON.stringify({
              type: 'assistant',
              message: {
                content: [
                  { type: 'tool_use', name: tool.name, input: tool.input },
                ],
              },
            }) + '\n',
          ),
        );
      }

      expect(outputs).toHaveLength(tools.length);
      for (const [index, tool] of tools.entries()) {
        expect(outputs[index].summary).toBe(tool.expected);
      }
    });
  });

  describe('devMode', () => {
    it('emits text blocks and tool details in dev mode', async () => {
      const developmentAdapter = new ClaudeCodeAdapter({ devMode: true });
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await developmentAdapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const outputs: { type: string; summary: string; detail?: string }[] = [];
      session.onOutput((entry) => outputs.push(entry));

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                { type: 'text', text: 'Thinking about the problem...' },
              ],
            },
          }) + '\n',
        ),
      );

      expect(outputs).toHaveLength(1);
      expect(outputs[0].type).toBe('text');
      expect(outputs[0].detail).toBe('Thinking about the problem...');

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  name: 'Read',
                  input: { file_path: 'x.ts' },
                },
              ],
            },
          }) + '\n',
        ),
      );

      expect(outputs).toHaveLength(2);
      expect(outputs[1].detail).toContain('file_path');

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'result',
            result: 'some result text',
          }) + '\n',
        ),
      );

      expect(outputs).toHaveLength(3);
      expect(outputs[2].type).toBe('tool_result');
      expect(outputs[2].summary).toBe('some result text');
    });

    it('handles result as object in dev mode', async () => {
      const developmentAdapter = new ClaudeCodeAdapter({ devMode: true });
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await developmentAdapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const outputs: { type: string; summary: string; detail?: string }[] = [];
      session.onOutput((entry) => outputs.push(entry));

      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'result',
            result: { key: 'value' },
          }) + '\n',
        ),
      );

      expect(outputs).toHaveLength(1);
      expect(outputs[0].type).toBe('tool_result');
    });

    it('truncates long text in dev mode', async () => {
      const developmentAdapter = new ClaudeCodeAdapter({ devMode: true });
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await developmentAdapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const outputs: { type: string; summary: string; detail?: string }[] = [];
      session.onOutput((entry) => outputs.push(entry));

      const longText = 'x'.repeat(200);
      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: longText }],
            },
          }) + '\n',
        ),
      );

      expect(outputs[0].summary.length).toBeLessThan(longText.length);
      expect(outputs[0].summary).toContain('...');
      expect(outputs[0].detail).toBe(longText);
    });

    it('truncates long result in dev mode', async () => {
      const developmentAdapter = new ClaudeCodeAdapter({ devMode: true });
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await developmentAdapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const outputs: { type: string; summary: string; detail?: string }[] = [];
      session.onOutput((entry) => outputs.push(entry));

      const longResult = 'y'.repeat(200);
      proc.stdout.emit(
        'data',
        Buffer.from(
          JSON.stringify({
            type: 'result',
            result: longResult,
          }) + '\n',
        ),
      );

      expect(outputs[0].summary).toContain('...');
    });
  });

  describe('line buffering', () => {
    it('handles data split across multiple chunks', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const session = await adapter.startSession({
        projectPath: '/tmp/project',
        prompt: 'test',
      });

      const onOutput = vi.fn();
      session.onOutput(onOutput);

      const fullLine = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Read', input: { file_path: 'test.ts' } },
          ],
        },
      });

      const half = Math.floor(fullLine.length / 2);
      proc.stdout.emit('data', Buffer.from(fullLine.slice(0, half)));
      expect(onOutput).not.toHaveBeenCalled();

      proc.stdout.emit('data', Buffer.from(fullLine.slice(half) + '\n'));
      expect(onOutput).toHaveBeenCalledTimes(1);
    });
  });
});
