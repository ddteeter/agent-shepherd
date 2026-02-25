export interface AgentAdapter {
  name: string;
  startSession(opts: { projectPath: string; prompt: string }): Promise<AgentSession>;
  resumeSession(opts: { sessionId: string; projectPath: string; prompt: string }): Promise<AgentSession>;
}

export interface AgentSession {
  id: string;
  onComplete(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
  kill(): Promise<void>;
}
