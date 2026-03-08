import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { reviewCommand } from '../review.js';

describe('reviewCommand', () => {
  let program: Command;
  let client: any;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    program = new Command();
    program.exitOverride();
    client = { get: vi.fn() };
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    reviewCommand(program, client);
  });

  describe('comments --summary', () => {
    it('shows comment summary with general comments', async () => {
      client.get
        .mockResolvedValueOnce({ title: 'My PR' })
        .mockResolvedValueOnce({
          total: 5,
          bySeverity: { 'must-fix': 2, suggestion: 3 },
          files: [
            {
              path: 'src/a.ts',
              count: 3,
              bySeverity: { 'must-fix': 1, suggestion: 2 },
            },
          ],
          generalCount: 2,
        });

      await program.parseAsync([
        'node',
        'test',
        'review',
        'comments',
        'pr-1',
        '--summary',
      ]);

      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Review Comments for: My PR');
      expect(output).toContain('2 must-fix');
      expect(output).toContain('3 suggestion');
      expect(output).toContain('General comments: 2');
      expect(output).toContain('src/a.ts');
    });

    it('shows summary without general comments when count is 0', async () => {
      client.get.mockResolvedValueOnce({ title: 'PR2' }).mockResolvedValueOnce({
        total: 1,
        bySeverity: { suggestion: 1 },
        files: [],
        generalCount: 0,
      });

      await program.parseAsync([
        'node',
        'test',
        'review',
        'comments',
        'pr-2',
        '--summary',
      ]);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('General comments');
    });
  });

  describe('comments (full)', () => {
    it('fetches all comments and formats them', async () => {
      client.get
        .mockResolvedValueOnce({ title: 'My PR' })
        .mockResolvedValueOnce([
          {
            id: 'c1',
            filePath: 'src/a.ts',
            startLine: 10,
            endLine: 10,
            body: 'Fix this',
            severity: 'must-fix',
            author: 'human',
            parentCommentId: null,
            resolved: false,
          },
          {
            id: 'c2',
            filePath: null,
            startLine: null,
            endLine: null,
            body: 'General note',
            severity: 'suggestion',
            author: 'human',
            parentCommentId: null,
            resolved: false,
          },
          {
            id: 'c3',
            filePath: 'src/a.ts',
            startLine: 10,
            endLine: 10,
            body: 'Fixed it',
            severity: 'suggestion',
            author: 'agent',
            parentCommentId: 'c1',
            resolved: false,
          },
        ]);

      await program.parseAsync(['node', 'test', 'review', 'comments', 'pr-1']);

      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('All comments');
      expect(output).toContain('[MUST FIX]');
      expect(output).toContain('Line 10');
      expect(output).toContain('Fix this');
      expect(output).toContain('General note');
      expect(output).toContain('Thread:');
      expect(output).toContain('agent: Fixed it');
    });

    it('formats multi-line comment locations', async () => {
      client.get.mockResolvedValueOnce({ title: 'PR' }).mockResolvedValueOnce([
        {
          id: 'c1',
          filePath: 'src/b.ts',
          startLine: 5,
          endLine: 10,
          body: 'Refactor this range',
          severity: 'request',
          author: 'human',
          parentCommentId: null,
          resolved: false,
        },
      ]);

      await program.parseAsync(['node', 'test', 'review', 'comments', 'pr-1']);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Lines 5-10');
      expect(output).toContain('[REQUEST]');
    });

    it('filters by file', async () => {
      client.get
        .mockResolvedValueOnce({ title: 'PR' })
        .mockResolvedValueOnce([]);

      await program.parseAsync([
        'node',
        'test',
        'review',
        'comments',
        'pr-1',
        '--file',
        'src/a.ts',
      ]);

      expect(client.get).toHaveBeenCalledWith(
        '/api/prs/pr-1/comments?filePath=src%2Fa.ts',
      );
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Comments for: src/a.ts');
    });

    it('filters by severity', async () => {
      client.get
        .mockResolvedValueOnce({ title: 'PR' })
        .mockResolvedValueOnce([]);

      await program.parseAsync([
        'node',
        'test',
        'review',
        'comments',
        'pr-1',
        '--severity',
        'must-fix',
      ]);

      expect(client.get).toHaveBeenCalledWith(
        '/api/prs/pr-1/comments?severity=must-fix',
      );
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('must-fix comments');
    });

    it('skips resolved comments in output', async () => {
      client.get.mockResolvedValueOnce({ title: 'PR' }).mockResolvedValueOnce([
        {
          id: 'c1',
          filePath: 'src/a.ts',
          startLine: 1,
          endLine: 1,
          body: 'Resolved comment',
          severity: 'suggestion',
          author: 'human',
          parentCommentId: null,
          resolved: true,
        },
      ]);

      await program.parseAsync(['node', 'test', 'review', 'comments', 'pr-1']);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('Resolved comment');
    });

    it('handles comments with null endLine', async () => {
      client.get.mockResolvedValueOnce({ title: 'PR' }).mockResolvedValueOnce([
        {
          id: 'c1',
          filePath: 'src/a.ts',
          startLine: 5,
          endLine: null,
          body: 'Single line',
          severity: 'suggestion',
          author: 'human',
          parentCommentId: null,
          resolved: false,
        },
      ]);

      await program.parseAsync(['node', 'test', 'review', 'comments', 'pr-1']);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('Line 5');
    });
  });
});
