export interface AgentActivityEntry {
  timestamp: string;
  type: string;
  summary: string;
  detail?: string;
}

export interface AgentAdapter {
  name: string;
  startSession(opts: {
    projectPath: string;
    prompt: string;
    additionalDirs?: string[];
  }): Promise<AgentSession>;
}

export interface AgentSession {
  id: string;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  onOutput(callback: (entry: AgentActivityEntry) => void): void;
  kill(): Promise<void>;
}

export type AgentSource = 'code-fix' | 'insights';

export interface AgentRunConfig {
  prId: string;
  projectPath: string;
  prompt: string;
  source: AgentSource;
  additionalDirs?: string[];
}

export interface AgentRunCallbacks {
  onComplete: () => void;
  onError: (error: Error) => void;
}
