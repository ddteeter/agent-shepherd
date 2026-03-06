import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionLog, SessionLogProvider } from './provider.js';

export class ClaudeCodeSessionLogProvider implements SessionLogProvider {
  readonly name = 'claude-code';
  private readonly homeDir: string;

  constructor(opts?: { homeDir?: string }) {
    this.homeDir = opts?.homeDir ?? process.env.HOME ?? '';
  }

  projectDirKey(projectPath: string): string {
    return projectPath.replace(/\//g, '-');
  }

  async findSessions(opts: {
    projectPath: string;
    branch: string;
  }): Promise<SessionLog[]> {
    const projectDir = join(
      this.homeDir,
      '.claude',
      'projects',
      this.projectDirKey(opts.projectPath),
    );

    let entries: string[];
    try {
      entries = await readdir(projectDir);
    } catch {
      return [];
    }

    const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'));
    const results: SessionLog[] = [];

    for (const file of jsonlFiles) {
      const filePath = join(projectDir, file);
      const session = await this.parseSessionFile(filePath, opts.branch);
      if (session) {
        results.push(session);
      }
    }

    // Sort by most recent first (using file mtime)
    const withStats = await Promise.all(
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
  ): Promise<SessionLog | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(0, 20);

      let sessionId: string | undefined;
      let gitBranch: string | undefined;
      let startedAt: string | undefined;

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
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
        return null;
      }

      return {
        sessionId,
        filePath,
        startedAt: startedAt ?? new Date().toISOString(),
        branch: gitBranch,
      };
    } catch {
      return null;
    }
  }
}
