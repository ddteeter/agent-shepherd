import { spawn, type ChildProcess } from 'node:child_process';
import type {
  AgentAdapter,
  AgentSession,
  AgentActivityEntry,
} from './types.js';

function summarizeToolUse(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case 'Read': {
      return `Reading ${input.file_path || 'file'}`;
    }
    case 'Edit': {
      return `Editing ${input.file_path || 'file'}`;
    }
    case 'Write': {
      return `Writing ${input.file_path || 'file'}`;
    }
    case 'Bash': {
      const cmd = String(input.command || '');
      return `Running ${cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd}`;
    }
    case 'Grep': {
      return `Searching for ${input.pattern || 'pattern'}`;
    }
    case 'Glob': {
      return `Finding files matching ${input.pattern || 'pattern'}`;
    }
    case 'Task': {
      return `Dispatching sub-agent`;
    }
    default: {
      return `Using ${name}`;
    }
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code';
  private devMode: boolean;

  constructor(options?: { devMode?: boolean }) {
    this.devMode = options?.devMode ?? false;
  }

  async startSession(options: {
    projectPath: string;
    prompt: string;
    additionalDirs?: string[];
  }): Promise<AgentSession> {
    const arguments_ = [
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--allowedTools',
      'Bash(agent-shepherd:*)',
      'Bash(git:*)',
    ];
    if (options.additionalDirs) {
      for (const dir of options.additionalDirs) {
        arguments_.push('--add-dir', dir);
      }
    }
    arguments_.push('-p');
    const proc = spawn('claude', arguments_, {
      cwd: options.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin?.end(options.prompt);
    return this.wrapProcess(proc, this.devMode);
  }

  private wrapProcess(proc: ChildProcess, developmentMode: boolean): AgentSession {
    let completeCallback: (() => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;
    let outputCallback: ((entry: AgentActivityEntry) => void) | null = null;
    let sessionId = proc.pid?.toString() || 'unknown';
    let stderr = '';
    let lineBuffer = '';
    let lastStopReason: string | null = null;
    let lastAssistantText: string | null = null;

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);

          // Extract session ID from init message
          if (
            message.type === 'system' &&
            message.subtype === 'init' &&
            message.session_id
          ) {
            sessionId = message.session_id;
          }

          // Track stop reason for end_turn detection
          if (message.type === 'assistant' && message.message?.stop_reason) {
            lastStopReason = message.message.stop_reason;
          }

          // Extract tool uses, text, and result messages from assistant messages
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                lastAssistantText = String(block.text);
              }
              if (block.type === 'tool_use') {
                const entry: AgentActivityEntry = {
                  timestamp: new Date().toISOString(),
                  type: block.name,
                  summary: summarizeToolUse(block.name, block.input || {}),
                  ...(developmentMode && block.input
                    ? { detail: JSON.stringify(block.input, null, 2) }
                    : {}),
                };
                outputCallback?.(entry);
              } else if (developmentMode && block.type === 'text' && block.text) {
                const text = String(block.text);
                const entry: AgentActivityEntry = {
                  timestamp: new Date().toISOString(),
                  type: 'text',
                  summary:
                    text.length > 120 ? text.slice(0, 120) + '...' : text,
                  detail: text,
                };
                outputCallback?.(entry);
              }
            }
          }

          // Emit tool results in dev mode
          if (developmentMode && message.type === 'result') {
            const content =
              typeof message.result === 'string'
                ? message.result
                : JSON.stringify(message.result, null, 2);
            const entry: AgentActivityEntry = {
              timestamp: new Date().toISOString(),
              type: 'tool_result',
              summary:
                content.length > 120 ? content.slice(0, 120) + '...' : content,
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
          const lastMessage = lastAssistantText
            ? `. Last message: ${lastAssistantText.slice(0, 200)}`
            : '';
          errorCallback?.(
            new Error(
              `Agent stopped waiting for input (end_turn) — it may not have had the information or permissions needed to complete the task${lastMessage}`,
            ),
          );
        } else {
          completeCallback?.();
        }
      } else {
        const detail = stderr.trim() || 'no output captured';
        errorCallback?.(
          new Error(`Claude Code exited with code ${code}: ${detail}`),
        );
      }
    });

    proc.on('error', (error) => {
      errorCallback?.(error);
    });

    return {
      get id() {
        return sessionId;
      },
      onComplete(callback) {
        completeCallback = callback;
      },
      onError(callback) {
        errorCallback = callback;
      },
      onOutput(callback) {
        outputCallback = callback;
      },
      async kill() {
        proc.kill('SIGTERM');
      },
    };
  }
}
