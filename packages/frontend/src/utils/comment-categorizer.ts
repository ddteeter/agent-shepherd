import type { Comment } from '../components/comment-thread.js';
import type { FileDiffData } from './diff-parser.js';

function sideForLineType(type: string): 'old' | 'new' {
  return type === 'remove' ? 'old' : 'new';
}

function buildValidLineKeys(parsedFiles: FileDiffData[]): {
  validLineKeys: Set<string>;
  diffFilePaths: Set<string>;
} {
  const validLineKeys = new Set<string>();
  const diffFilePaths = new Set<string>();
  for (const file of parsedFiles) {
    diffFilePaths.add(file.path);
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const side = sideForLineType(line.type);
        const lineNo =
          side === 'old'
            ? (line.oldLineNo ?? 0)
            : (line.newLineNo ?? line.oldLineNo ?? 0);
        validLineKeys.add(`${file.path}:${String(lineNo)}:${side}`);
      }
    }
  }
  return { validLineKeys, diffFilePaths };
}

function appendToMap(
  map: Map<string, Comment[]>,
  key: string,
  comment: Comment,
): void {
  const existing = map.get(key) ?? [];
  existing.push(comment);
  map.set(key, existing);
}

function categorizeComment(
  comment: Comment,
  byFileLine: Map<string, Comment[]>,
  byFilePath: Map<string, Comment[]>,
  globals: Comment[],
  byParent: Map<string, Comment[]>,
  orphaned: Map<string, Comment[]>,
  validLineKeys: Set<string>,
  diffFilePaths: Set<string>,
): void {
  if (comment.parentCommentId) {
    appendToMap(byParent, comment.parentCommentId, comment);
    return;
  }
  if (comment.filePath === undefined) {
    globals.push(comment);
    return;
  }
  if (comment.startLine === undefined) {
    if (diffFilePaths.has(comment.filePath)) {
      appendToMap(byFilePath, `file:${comment.filePath}`, comment);
    } else {
      appendToMap(orphaned, comment.filePath, comment);
    }
    return;
  }
  const side = comment.side ?? 'new';
  const key = `${comment.filePath}:${String(comment.endLine ?? comment.startLine)}:${side}`;
  if (validLineKeys.has(key)) {
    appendToMap(byFileLine, key, comment);
  } else {
    appendToMap(orphaned, comment.filePath, comment);
  }
}

export function buildCommentRangeLines(comments: Comment[]): Set<string> {
  const rangeLines = new Set<string>();
  for (const comment of comments) {
    if (
      !comment.parentCommentId &&
      comment.filePath !== undefined &&
      comment.startLine !== undefined &&
      comment.endLine !== undefined &&
      comment.startLine !== comment.endLine
    ) {
      const side = comment.side ?? 'new';
      for (let l = comment.startLine; l <= comment.endLine; l++) {
        rangeLines.add(`${comment.filePath}:${String(l)}:${side}`);
      }
    }
  }
  return rangeLines;
}

export function categorizeComments(
  comments: Comment[],
  parsedFiles: FileDiffData[],
) {
  const byFileLine = new Map<string, Comment[]>();
  const byFilePath = new Map<string, Comment[]>();
  const globals: Comment[] = [];
  const byParent = new Map<string, Comment[]>();
  const orphaned = new Map<string, Comment[]>();
  const { validLineKeys, diffFilePaths } = buildValidLineKeys(parsedFiles);

  for (const comment of comments) {
    categorizeComment(
      comment,
      byFileLine,
      byFilePath,
      globals,
      byParent,
      orphaned,
      validLineKeys,
      diffFilePaths,
    );
  }

  return {
    commentsByFileLine: byFileLine,
    fileCommentsByPath: byFilePath,
    globalComments: globals,
    repliesByParent: byParent,
    commentRangeLines: buildCommentRangeLines(comments),
    orphanedByFile: orphaned,
  };
}
