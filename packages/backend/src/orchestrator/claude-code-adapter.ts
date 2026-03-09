import { spawn, type ChildProcess } from 'node:child_process';
import type {
  AgentAdapter,
  AgentSession,
  AgentActivityEntry,
} from './types.js';

interface StreamMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    stop_reason?: string;
    content?: ContentBlock[];
  };
  result?: unknown;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function summarizeToolUse(
  name: string,
  input: Record<string, unknown>,
): string {
  switch (name) {
    case 'Read': {
      const filePath =
        typeof input.file_path === 'string' ? input.file_path : 'file';
      return `Reading ${filePath}`;
    }
    case 'Edit': {
      const filePath =
        typeof input.file_path === 'string' ? input.file_path : 'file';
      return `Editing ${filePath}`;
    }
    case 'Write': {
      const filePath =
        typeof input.file_path === 'string' ? input.file_path : 'file';
      return `Writing ${filePath}`;
    }
    case 'Bash': {
      const cmd = typeof input.command === 'string' ? input.command : '';
      return `Running ${cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd}`;
    }
    case 'Grep': {
      const pattern =
        typeof input.pattern === 'string' ? input.pattern : 'pattern';
      return `Searching for ${pattern}`;
    }
    case 'Glob': {
      const pattern =
        typeof input.pattern === 'string' ? input.pattern : 'pattern';
      return `Finding files matching ${pattern}`;
    }
    case 'Task': {
      return `Dispatching sub-agent`;
    }
    default: {
      return `Using ${name}`;
    }
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

interface StreamState {
  sessionId: string;
  lastStopReason: string | undefined;
  lastAssistantText: string | undefined;
}

function processContentBlocks(
  blocks: ContentBlock[],
  developmentMode: boolean,
  state: StreamState,
  outputCallback: ((entry: AgentActivityEntry) => void) | undefined,
): void {
  for (const block of blocks) {
    if (block.type === 'text' && block.text) {
      state.lastAssistantText = block.text;
    }
    if (block.type === 'tool_use' && block.name) {
      const entry: AgentActivityEntry = {
        timestamp: new Date().toISOString(),
        type: block.name,
        summary: summarizeToolUse(block.name, block.input ?? {}),
        ...(developmentMode && block.input
          ? { detail: JSON.stringify(block.input, undefined, 2) }
          : {}),
      };
      outputCallback?.(entry);
    } else if (developmentMode && block.type === 'text' && block.text) {
      const entry: AgentActivityEntry = {
        timestamp: new Date().toISOString(),
        type: 'text',
        summary: truncate(block.text, 120),
        detail: block.text,
      };
      outputCallback?.(entry);
    }
  }
}

function processStreamMessage(
  message: StreamMessage,
  developmentMode: boolean,
  state: StreamState,
  outputCallback: ((entry: AgentActivityEntry) => void) | undefined,
): void {
  if (
    message.type === 'system' &&
    message.subtype === 'init' &&
    message.session_id
  ) {
    state.sessionId = message.session_id;
  }

  if (message.type === 'assistant' && message.message?.stop_reason) {
    state.lastStopReason = message.message.stop_reason;
  }

  if (message.type === 'assistant' && message.message?.content) {
    processContentBlocks(
      message.message.content,
      developmentMode,
      state,
      outputCallback,
    );
  }

  if (developmentMode && message.type === 'result') {
    const content =
      typeof message.result === 'string'
        ? message.result
        : JSON.stringify(message.result, undefined, 2);
    const entry: AgentActivityEntry = {
      timestamp: new Date().toISOString(),
      type: 'tool_result',
      summary: truncate(content, 120),
      detail: content,
    };
    outputCallback?.(entry);
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code';
  private devMode: boolean;

  constructor(options?: { devMode?: boolean }) {
    this.devMode = options?.devMode ?? false;
  }

  startSession(options: {
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
      for (const directory of options.additionalDirs) {
        arguments_.push('--add-dir', directory);
      }
    }
    arguments_.push('-p');
    const proc = spawn('claude', arguments_, {
      cwd: options.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stdin.end(options.prompt);
    return this.wrapProcess(proc, this.devMode);
  }

  private wrapProcess(
    proc: ChildProcess,
    developmentMode: boolean,
  ): Promise<AgentSession> {
    let completeCallback: (() => void) | undefined;
    let errorCallback: ((error: Error) => void) | undefined;
    let outputCallback: ((entry: AgentActivityEntry) => void) | undefined;
    const state: StreamState = {
      sessionId: proc.pid?.toString() ?? 'unknown',
      lastStopReason: undefined,
      lastAssistantText: undefined,
    };
    let stderr = '';
    let lineBuffer = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as StreamMessage;
          processStreamMessage(message, developmentMode, state, outputCallback);
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
        if (state.lastStopReason === 'end_turn') {
          const lastMessage = state.lastAssistantText
            ? `. Last message: ${state.lastAssistantText.slice(0, 200)}`
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
          new Error(`Claude Code exited with code ${String(code)}: ${detail}`),
        );
      }
    });

    proc.on('error', (error) => {
      errorCallback?.(error);
    });

    return Promise.resolve({
      get id() {
        return state.sessionId;
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
      kill() {
        proc.kill('SIGTERM');
        return Promise.resolve();
      },
    });
  }
}
