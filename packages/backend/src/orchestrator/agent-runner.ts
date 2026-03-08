import { existsSync } from 'fs';
import type {
  AgentAdapter,
  AgentSession,
  AgentRunConfig,
  AgentRunCallbacks,
  AgentSource,
} from './types.js';

interface AgentRunnerDeps {
  adapter: AgentAdapter;
  broadcast: (event: string, data: unknown) => void;
}

export class AgentRunner {
  private adapter: AgentAdapter;
  private broadcast: (event: string, data: unknown) => void;
  private activeSessions = new Map<string, AgentSession>();

  constructor(deps: AgentRunnerDeps) {
    this.adapter = deps.adapter;
    this.broadcast = deps.broadcast;
  }

  private sessionKey(prId: string, source: AgentSource): string {
    return `${prId}:${source}`;
  }

  hasActiveSession(prId: string, source: AgentSource): boolean {
    return this.activeSessions.has(this.sessionKey(prId, source));
  }

  async run(
    config: AgentRunConfig,
    callbacks: AgentRunCallbacks,
  ): Promise<void> {
    const { prId, projectPath, prompt, source, additionalDirs } = config;
    const key = this.sessionKey(prId, source);

    if (!existsSync(projectPath)) {
      throw new Error(
        `Working directory does not exist: ${projectPath}\n` +
          'The worktree may have been removed. Recreate it and try again.',
      );
    }

    const session = await this.adapter.startSession({
      projectPath,
      prompt,
      additionalDirs,
    });
    this.activeSessions.set(key, session);

    this.broadcast('agent:working', { prId, source });

    session.onOutput((entry) => {
      this.broadcast('agent:output', { prId, source, entry });
    });

    session.onComplete(() => {
      this.activeSessions.delete(key);
      this.broadcast('agent:completed', { prId, source });
      callbacks.onComplete();
    });

    session.onError((error) => {
      this.activeSessions.delete(key);
      this.broadcast('agent:error', { prId, source, error: error.message });
      callbacks.onError(error);
    });
  }

  async cancel(prId: string, source: AgentSource): Promise<void> {
    const key = this.sessionKey(prId, source);
    const session = this.activeSessions.get(key);
    if (session) {
      await session.kill();
      this.activeSessions.delete(key);
    }
    this.broadcast('agent:cancelled', { prId, source });
  }
}
