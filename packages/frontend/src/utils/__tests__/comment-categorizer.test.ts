import { describe, it, expect } from 'vitest';
import {
  categorizeComments,
  buildCommentRangeLines,
} from '../comment-categorizer.js';
import type { FileDiffData } from '../diff-parser.js';

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    reviewCycleId: 'rc1',
    filePath: 'src/app.ts',
    startLine: 1,
    endLine: 1,
    body: 'test',
    type: 'suggestion',
    author: 'human' as const,
    parentCommentId: undefined,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeFile(path: string): FileDiffData {
  return {
    path,
    hunks: [
      {
        header: '@@ -1,1 +1,1 @@',
        lines: [
          { type: 'context', content: 'line', oldLineNo: 1, newLineNo: 1 },
        ],
      },
    ],
    lineCount: 1,
    additions: 0,
    deletions: 0,
    status: 'modified',
  };
}

describe('categorizeComments', () => {
  it('categorizes line comments by file:line:side key', () => {
    const result = categorizeComments(
      [makeComment()],
      [makeFile('src/app.ts')],
    );
    expect(result.commentsByFileLine.get('src/app.ts:1:new')).toHaveLength(1);
  });

  it('categorizes global comments (no filePath)', () => {
    const result = categorizeComments(
      [
        makeComment({
          filePath: undefined,
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      [makeFile('src/app.ts')],
    );
    expect(result.globalComments).toHaveLength(1);
  });

  it('categorizes file-level comments (filePath but no startLine)', () => {
    const result = categorizeComments(
      [makeComment({ startLine: undefined, endLine: undefined })],
      [makeFile('src/app.ts')],
    );
    expect(result.fileCommentsByPath.get('file:src/app.ts')).toHaveLength(1);
  });

  it('categorizes replies by parent ID', () => {
    const result = categorizeComments(
      [makeComment({ id: 'r1', parentCommentId: 'c1' })],
      [makeFile('src/app.ts')],
    );
    expect(result.repliesByParent.get('c1')).toHaveLength(1);
  });

  it('orphans comments on lines not in the diff', () => {
    const result = categorizeComments(
      [makeComment({ startLine: 999, endLine: 999 })],
      [makeFile('src/app.ts')],
    );
    expect(result.orphanedByFile.get('src/app.ts')).toHaveLength(1);
  });

  it('orphans comments on files not in the diff', () => {
    const result = categorizeComments(
      [
        makeComment({
          filePath: 'missing.ts',
          startLine: undefined,
          endLine: undefined,
        }),
      ],
      [makeFile('src/app.ts')],
    );
    expect(result.orphanedByFile.get('missing.ts')).toHaveLength(1);
  });
});

describe('buildCommentRangeLines', () => {
  it('builds set of line keys for multi-line comments', () => {
    const comments = [makeComment({ startLine: 2, endLine: 4 })];
    const result = buildCommentRangeLines(comments);
    expect(result.has('src/app.ts:2:new')).toBe(true);
    expect(result.has('src/app.ts:3:new')).toBe(true);
    expect(result.has('src/app.ts:4:new')).toBe(true);
    expect(result.has('src/app.ts:5:new')).toBe(false);
  });

  it('skips single-line comments', () => {
    const comments = [makeComment({ startLine: 1, endLine: 1 })];
    const result = buildCommentRangeLines(comments);
    expect(result.size).toBe(0);
  });
});
