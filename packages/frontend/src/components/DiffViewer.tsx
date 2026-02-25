import { useRef, useEffect, useState } from 'react';
import { CommentForm } from './CommentForm.js';
import { CommentThread } from './CommentThread.js';
import type { Comment } from './CommentThread.js';

interface DiffViewerProps {
  diff: string;
  files: string[];
  selectedFile: string | null;
  comments?: Comment[];
  onAddComment?: (data: { filePath: string; line: number; body: string; severity: string }) => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onResolveComment?: (commentId: string) => void;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}

function parseDiff(rawDiff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = rawDiff.split('\n');
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      currentFile = { path: '', hunks: [] };
      currentHunk = null;
    } else if (line.startsWith('+++ b/')) {
      if (currentFile) currentFile.path = line.slice(6);
    } else if (line.startsWith('--- a/') || line.startsWith('--- /dev/null')) {
      // skip --- header line
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      currentHunk = { header: line, lines: [] };
      if (currentFile) currentFile.hunks.push(currentHunk);
    } else if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', content: line.slice(1), newLineNo: newLine++ });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNo: oldLine++ });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', content: line.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ });
      }
    }
  }
  if (currentFile) files.push(currentFile);

  return files;
}

export function DiffViewer({ diff, files, selectedFile, comments = [], onAddComment, onReplyComment, onResolveComment }: DiffViewerProps) {
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const parsedFiles = parseDiff(diff);
  const [hoveredLine, setHoveredLine] = useState<{ file: string; line: number } | null>(null);
  const [commentFormLine, setCommentFormLine] = useState<{ file: string; line: number } | null>(null);

  useEffect(() => {
    if (selectedFile && fileRefs.current[selectedFile]) {
      fileRefs.current[selectedFile]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedFile]);

  // Group comments by file and line (top-level comments only, keyed by newLineNo or startLine)
  const commentsByFileLine = new Map<string, Comment[]>();
  const repliesByParent = new Map<string, Comment[]>();

  for (const comment of comments) {
    if (comment.parentCommentId) {
      const existing = repliesByParent.get(comment.parentCommentId) || [];
      existing.push(comment);
      repliesByParent.set(comment.parentCommentId, existing);
    } else {
      const key = `${comment.filePath}:${comment.startLine}`;
      const existing = commentsByFileLine.get(key) || [];
      existing.push(comment);
      commentsByFileLine.set(key, existing);
    }
  }

  if (parsedFiles.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm opacity-70">No diff content available.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {parsedFiles.map((file) => (
        <div
          key={file.path}
          ref={(el) => { fileRefs.current[file.path] = el; }}
          className="mb-6 border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-sm font-mono font-medium border-b"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
          >
            {file.path}
          </div>
          <div className="font-mono text-sm">
            {file.hunks.map((hunk, hunkIdx) => (
              <div key={hunkIdx}>
                <div className="px-4 py-1 text-xs opacity-50" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                  {hunk.header}
                </div>
                {hunk.lines.map((line, lineIdx) => {
                  const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
                  const isHovered = hoveredLine?.file === file.path && hoveredLine?.line === lineNo;
                  const isFormOpen = commentFormLine?.file === file.path && commentFormLine?.line === lineNo;
                  const lineComments = commentsByFileLine.get(`${file.path}:${lineNo}`) || [];

                  return (
                    <div key={lineIdx}>
                      <div
                        className="px-4 py-0 flex relative group"
                        style={{
                          backgroundColor:
                            line.type === 'add' ? 'rgba(46, 160, 67, 0.15)' :
                            line.type === 'remove' ? 'rgba(248, 81, 73, 0.15)' :
                            'transparent',
                        }}
                        onMouseEnter={() => setHoveredLine({ file: file.path, line: lineNo })}
                        onMouseLeave={() => setHoveredLine(null)}
                      >
                        {/* Add comment button on hover */}
                        {onAddComment && isHovered && !isFormOpen && (
                          <button
                            className="absolute left-0 top-0 w-5 h-5 flex items-center justify-center text-white text-xs rounded"
                            style={{ backgroundColor: 'var(--color-accent)', transform: 'translateX(-2px)' }}
                            onClick={() => setCommentFormLine({ file: file.path, line: lineNo })}
                            title="Add comment"
                          >
                            +
                          </button>
                        )}
                        <span className="w-12 text-right pr-2 select-none opacity-40 shrink-0">
                          {line.oldLineNo ?? ''}
                        </span>
                        <span className="w-12 text-right pr-2 select-none opacity-40 shrink-0">
                          {line.newLineNo ?? ''}
                        </span>
                        <span className="w-4 select-none shrink-0" style={{
                          color: line.type === 'add' ? 'var(--color-success)' :
                                 line.type === 'remove' ? 'var(--color-danger)' : 'transparent'
                        }}>
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                        </span>
                        <span className="whitespace-pre">{line.content}</span>
                      </div>

                      {/* Inline comment form */}
                      {isFormOpen && onAddComment && (
                        <div className="mx-4 my-1">
                          <CommentForm
                            onSubmit={({ body, severity }) => {
                              onAddComment({ filePath: file.path, line: lineNo, body, severity: severity || 'suggestion' });
                              setCommentFormLine(null);
                            }}
                            onCancel={() => setCommentFormLine(null)}
                          />
                        </div>
                      )}

                      {/* Existing comment threads for this line */}
                      {lineComments.map((comment) => (
                        <CommentThread
                          key={comment.id}
                          comment={comment}
                          replies={repliesByParent.get(comment.id) || []}
                          onReply={onReplyComment || (() => {})}
                          onResolve={onResolveComment || (() => {})}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
