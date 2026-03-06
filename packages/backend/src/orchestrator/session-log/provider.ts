export interface SessionLog {
  sessionId: string;
  filePath: string;
  startedAt: string;
  branch: string;
}

export interface SessionLogProvider {
  name: string;
  findSessions(opts: {
    projectPath: string;
    branch: string;
  }): Promise<SessionLog[]>;
}
