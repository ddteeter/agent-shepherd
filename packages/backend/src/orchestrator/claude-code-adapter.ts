import { spawn, type ChildProcess } from 'child_process';
import type { AgentAdapter, AgentSession, AgentActivityEntry } from './types.js';

function summarizeToolUse(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
      return `Reading ${input.file_path || 'file'}`;
    case 'Edit':
      return `Editing ${input.file_path || 'file'}`;
    case 'Write':
      return `Writing ${input.file_path || 'file'}`;
    case 'Bash': {
      const cmd = String(input.command || '');
      return `Running ${cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd}`;
    }
    case 'Grep':
      return `Searching for ${input.pattern || 'pattern'}`;
    case 'Glob':
      return `Finding files matching ${input.pattern || 'pattern'}`;
    case 'Task':
      return `Dispatching sub-agent`;
    default:
      return `Using ${name}`;
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code';
  private devMode: boolean;

  constructor(opts?: { devMode?: boolean }) {
    this.devMode = opts?.devMode ?? false;
  }

  async startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(agent-shepherd:*)', 'Bash(git:*)', '-p'], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin?.end(opts.prompt);
    return this.wrapProcess(proc, this.devMode);
  }

  private wrapProcess(proc: ChildProcess, devMode: boolean): AgentSession {
    let completeCallback: (() => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;
    let outputCallback: ((entry: AgentActivityEntry) => void) | null = null;
    let sessionId = proc.pid?.toString() || 'unknown';
    let stderr = '';
    let lineBuffer = '';
    let lastStopReason: string | null = null;

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          // Extract session ID from init message
          if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
            sessionId = msg.session_id;
          }

          // Track stop reason for end_turn detection
          if (msg.type === 'assistant' && msg.message?.stop_reason) {
            lastStopReason = msg.message.stop_reason;
          }

          // Extract tool uses and text from assistant messages
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                const entry: AgentActivityEntry = {
                  timestamp: new Date().toISOString(),
                  type: block.name,
                  summary: summarizeToolUse(block.name, block.input || {}),
                  ...(devMode && block.input ? { detail: JSON.stringify(block.input, null, 2) } : {}),
                };
                outputCallback?.(entry);
              } else if (devMode && block.type === 'text' && block.text) {
                const text = String(block.text);
                const entry: AgentActivityEntry = {
                  timestamp: new Date().toISOString(),
                  type: 'text',
                  summary: text.length > 120 ? text.slice(0, 120) + '...' : text,
                  detail: text,
                };
                outputCallback?.(entry);
              }
            }
          }

          // Emit tool results in dev mode
          if (devMode && msg.type === 'result') {
            const content = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result, null, 2);
            const entry: AgentActivityEntry = {
              timestamp: new Date().toISOString(),
              type: 'tool_result',
              summary: content.length > 120 ? content.slice(0, 120) + '...' : content,
              detail: content,
            };
            outputCallback?.(entry);
          }
        } catch {
          // Ignore unparseable lines
        }
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        if (lastStopReason === 'end_turn') {
          errorCallback?.(new Error('Agent stopped waiting for input (end_turn) — it may not have had the information or permissions needed to complete the task'));
        } else {
          completeCallback?.();
        }
      } else {
        const detail = stderr.trim() || 'no output captured';
        errorCallback?.(new Error(`Claude Code exited with code ${code}: ${detail}`));
      }
    });

    proc.on('error', (err) => {
      errorCallback?.(err);
    });

    return {
      get id() { return sessionId; },
      onComplete(cb) { completeCallback = cb; },
      onError(cb) { errorCallback = cb; },
      onOutput(cb) { outputCallback = cb; },
      async kill() { proc.kill('SIGTERM'); },
    };
  }
}
