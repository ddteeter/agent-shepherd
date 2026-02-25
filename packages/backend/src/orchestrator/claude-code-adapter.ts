import { spawn, type ChildProcess } from 'child_process';
import type { AgentAdapter, AgentSession } from './types.js';

export class ClaudeCodeAdapter implements AgentAdapter {
  name = 'claude-code';

  async startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--yes', '-p', opts.prompt], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return this.wrapProcess(proc);
  }

  async resumeSession(opts: { sessionId: string; projectPath: string; prompt: string }): Promise<AgentSession> {
    const proc = spawn('claude', ['--resume', opts.sessionId, '--yes', '-p', opts.prompt], {
      cwd: opts.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return this.wrapProcess(proc);
  }

  private wrapProcess(proc: ChildProcess): AgentSession {
    let completeCallback: (() => void) | null = null;
    let errorCallback: ((error: Error) => void) | null = null;

    proc.on('exit', (code) => {
      if (code === 0) {
        completeCallback?.();
      } else {
        errorCallback?.(new Error(`Claude Code exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      errorCallback?.(err);
    });

    return {
      id: proc.pid?.toString() || 'unknown',
      onComplete(cb) { completeCallback = cb; },
      onError(cb) { errorCallback = cb; },
      async kill() { proc.kill('SIGTERM'); },
    };
  }
}
