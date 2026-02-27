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

  async startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '-p'], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin?.end(opts.prompt);
    return this.wrapProcess(proc);
  }

  async resumeSession(opts: { sessionId: string; projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--resume', opts.sessionId, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '-p'], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin?.end(opts.prompt);
    return this.wrapProcess(proc);
  }

  private wrapProcess(proc: ChildProcess): AgentSession {
    let completeCallback: (() => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;
    let outputCallback: ((entry: AgentActivityEntry) => void) | null = null;
    let sessionId = proc.pid?.toString() || 'unknown';
    let stderr = '';
    let lineBuffer = '';

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

          // Extract tool uses from assistant messages
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                const entry: AgentActivityEntry = {
                  timestamp: new Date().toISOString(),
                  type: block.name,
                  summary: summarizeToolUse(block.name, block.input || {}),
                };
                outputCallback?.(entry);
              }
            }
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
        completeCallback?.();
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
