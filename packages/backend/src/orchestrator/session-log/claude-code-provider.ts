import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SessionLog, SessionLogProvider } from './provider.js';

interface SessionFileLine {
  sessionId?: string;
  gitBranch?: string;
  timestamp?: string;
}

export class ClaudeCodeSessionLogProvider implements SessionLogProvider {
  readonly name = 'claude-code';
  private readonly homeDirectory: string;

  constructor(options?: { homeDir?: string }) {
    this.homeDirectory = options?.homeDir ?? process.env.HOME ?? '';
  }

  projectDirKey(projectPath: string): string {
    return projectPath.replaceAll('/', '-');
  }

  async findSessions(options: {
    projectPath: string;
    branch: string;
  }): Promise<SessionLog[]> {
    const projectDirectory = path.join(
      this.homeDirectory,
      '.claude',
      'projects',
      this.projectDirKey(options.projectPath),
    );

    let entries: string[];
    try {
      entries = await readdir(projectDirectory);
    } catch {
      return [];
    }

    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));
    const results: SessionLog[] = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(projectDirectory, file);
      const session = await this.parseSessionFile(filePath, options.branch);
      if (session) {
        results.push(session);
      }
    }

    const withStats: { session: SessionLog; mtime: number }[] =
      await Promise.all(
        results.map(async (session) => {
          const fileStat = await stat(session.filePath);
          return { session, mtime: fileStat.mtimeMs };
        }),
      );

    withStats.sort((a, b) => b.mtime - a.mtime);
    return withStats.map((w) => w.session);
  }

  private async parseSessionFile(
    filePath: string,
    branch: string,
  ): Promise<SessionLog | undefined> {
    try {
      const content = await readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean).slice(0, 20);

      let sessionId: string | undefined;
      let gitBranch: string | undefined;
      let startedAt: string | undefined;

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as SessionFileLine;
          if (parsed.sessionId && !sessionId) {
            sessionId = parsed.sessionId;
          }
          if (parsed.gitBranch && !gitBranch) {
            gitBranch = parsed.gitBranch;
          }
          if (parsed.timestamp && !startedAt) {
            startedAt = parsed.timestamp;
          }
        } catch {
          // Skip unparseable lines
        }
      }

      if (!sessionId || gitBranch !== branch) {
        return undefined;
      }

      return {
        sessionId,
        filePath,
        startedAt: startedAt ?? new Date().toISOString(),
        branch: gitBranch,
      };
    } catch {
      return undefined;
    }
  }
}
