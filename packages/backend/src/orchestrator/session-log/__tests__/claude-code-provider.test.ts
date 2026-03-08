import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeCodeSessionLogProvider } from '../claude-code-provider.js';

describe('ClaudeCodeSessionLogProvider', () => {
  let tempHome: string;
  let provider: ClaudeCodeSessionLogProvider;

  beforeEach(() => {
    tempHome = join(
      tmpdir(),
      `claude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempHome, { recursive: true });
    provider = new ClaudeCodeSessionLogProvider({ homeDir: tempHome });
  });

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true });
  });

  function createSessionFile(
    projectPath: string,
    fileName: string,
    lines: Record<string, unknown>[],
  ): void {
    const projectDirKey = projectPath.replace(/\//g, '-');
    const dir = join(tempHome, '.claude', 'projects', projectDirKey);
    mkdirSync(dir, { recursive: true });
    const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    writeFileSync(join(dir, fileName), content);
  }

  describe('projectDirKey', () => {
    it('replaces slashes with dashes', () => {
      expect(provider.projectDirKey('/tmp/myproject')).toBe('-tmp-myproject');
      expect(provider.projectDirKey('/Users/dev/projects/foo')).toBe(
        '-Users-dev-projects-foo',
      );
    });
  });

  describe('findSessions', () => {
    it('finds sessions matching the branch', async () => {
      const projectPath = '/tmp/myproject';

      createSessionFile(projectPath, 'session-a.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-1',
          gitBranch: 'feat/x',
          timestamp: '2026-01-01T00:00:00Z',
        },
        {
          type: 'user',
          message: { role: 'user', content: 'hello' },
          sessionId: 'sess-1',
          gitBranch: 'feat/x',
        },
      ]);

      createSessionFile(projectPath, 'session-b.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-2',
          gitBranch: 'feat/y',
          timestamp: '2026-01-02T00:00:00Z',
        },
        {
          type: 'user',
          message: { role: 'user', content: 'world' },
          sessionId: 'sess-2',
          gitBranch: 'feat/y',
        },
      ]);

      createSessionFile(projectPath, 'session-c.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-3',
          gitBranch: 'feat/x',
          timestamp: '2026-01-03T00:00:00Z',
        },
        {
          type: 'user',
          message: { role: 'user', content: 'again' },
          sessionId: 'sess-3',
          gitBranch: 'feat/x',
        },
      ]);

      const sessions = await provider.findSessions({
        projectPath,
        branch: 'feat/x',
      });

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.sessionId).sort()).toEqual([
        'sess-1',
        'sess-3',
      ]);
      expect(sessions.every((s) => s.branch === 'feat/x')).toBe(true);
      // Each session should have a filePath
      for (const s of sessions) {
        expect(s.filePath).toContain('.jsonl');
      }
    });

    it('returns empty array when no sessions match', async () => {
      const projectPath = '/tmp/myproject';

      createSessionFile(projectPath, 'session-a.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-1',
          gitBranch: 'main',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ]);

      const sessions = await provider.findSessions({
        projectPath,
        branch: 'feat/nonexistent',
      });

      expect(sessions).toEqual([]);
    });

    it('returns empty array when project directory does not exist', async () => {
      const sessions = await provider.findSessions({
        projectPath: '/nonexistent/project',
        branch: 'main',
      });

      expect(sessions).toEqual([]);
    });

    it('returns sessions sorted by most recent first', async () => {
      const projectPath = '/tmp/myproject';

      // Create first file (older)
      createSessionFile(projectPath, 'old-session.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-old',
          gitBranch: 'feat/x',
          timestamp: '2026-01-01T00:00:00Z',
        },
      ]);

      // Small delay to ensure different mtimes
      await new Promise((r) => setTimeout(r, 50));

      // Create second file (newer)
      createSessionFile(projectPath, 'new-session.jsonl', [
        {
          type: 'system',
          sessionId: 'sess-new',
          gitBranch: 'feat/x',
          timestamp: '2026-01-02T00:00:00Z',
        },
      ]);

      const sessions = await provider.findSessions({
        projectPath,
        branch: 'feat/x',
      });

      expect(sessions).toHaveLength(2);
      // Most recent first
      expect(sessions[0].sessionId).toBe('sess-new');
      expect(sessions[1].sessionId).toBe('sess-old');
    });
  });
});
