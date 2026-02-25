import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CommentForm } from './CommentForm.js';
import { CommentThread } from './CommentThread.js';
import type { Comment } from './CommentThread.js';
import { useHighlighter, getLangFromPath, type TokenizedLine } from '../hooks/useHighlighter.js';
import { useTheme } from '../hooks/useTheme.js';

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
  lineCount: number;
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
      currentFile = { path: '', hunks: [], lineCount: 0 };
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
    } else if (currentHunk && currentFile) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', content: line.slice(1), newLineNo: newLine++ });
        currentFile.lineCount++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNo: oldLine++ });
        currentFile.lineCount++;
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', content: line.slice(1), oldLineNo: oldLine++, newLineNo: newLine++ });
        currentFile.lineCount++;
      }
    }
  }
  if (currentFile) files.push(currentFile);

  return files;
}

/** Render a line with syntax highlighting tokens, or plain text as fallback */
function HighlightedContent({ content, tokens }: { content: string; tokens: TokenizedLine | null }) {
  if (!tokens || tokens.length === 0) {
    return <span className="whitespace-pre">{content}</span>;
  }
  return (
    <span className="whitespace-pre">
      {tokens.map((token, i) => (
        <span key={i} style={{ color: token.color }}>{token.content}</span>
      ))}
    </span>
  );
}

/** Renders a single file's diff, lazy-mounted via IntersectionObserver */
function LazyFileDiff({
  file,
  commentsByFileLine,
  repliesByParent,
  commentFormLine,
  setCommentFormLine,
  onAddComment,
  handleAddComment,
  onReplyComment,
  onResolveComment,
  tokenizeLine,
  shikiTheme,
}: {
  file: FileDiff;
  commentsByFileLine: Map<string, Comment[]>;
  repliesByParent: Map<string, Comment[]>;
  commentFormLine: { file: string; line: number } | null;
  setCommentFormLine: (v: { file: string; line: number } | null) => void;
  onAddComment?: DiffViewerProps['onAddComment'];
  handleAddComment: (filePath: string, lineNo: number, body: string, severity: string) => void;
  onReplyComment?: DiffViewerProps['onReplyComment'];
  onResolveComment?: DiffViewerProps['onResolveComment'];
  tokenizeLine: (code: string, lang: string, theme: 'github-dark' | 'github-light') => TokenizedLine | null;
  shikiTheme: 'github-dark' | 'github-light';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: '500px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lang = getLangFromPath(file.path);
  const estimatedHeight = file.lineCount * 20 + file.hunks.length * 28;

  return (
    <div ref={ref}>
      {visible ? (
        <div className="font-mono text-sm">
          {file.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div className="px-4 py-1 text-xs opacity-50" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                {hunk.header}
              </div>
              {hunk.lines.map((line, lineIdx) => {
                const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
                const isFormOpen = commentFormLine?.file === file.path && commentFormLine?.line === lineNo;
                const lineComments = commentsByFileLine.get(`${file.path}:${lineNo}`) || [];
                const tokens = tokenizeLine(line.content, lang, shikiTheme);

                return (
                  <div key={lineIdx}>
                    <div
                      className="diff-line px-4 py-0 flex relative"
                      style={{
                        backgroundColor:
                          line.type === 'add' ? 'rgba(46, 160, 67, 0.15)' :
                          line.type === 'remove' ? 'rgba(248, 81, 73, 0.15)' :
                          'transparent',
                      }}
                    >
                      {onAddComment && !isFormOpen && (
                        <button
                          className="diff-line-btn absolute left-0 top-0 w-5 h-5 flex items-center justify-center text-white text-xs rounded opacity-0"
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
                      <HighlightedContent content={line.content} tokens={tokens} />
                    </div>

                    {isFormOpen && onAddComment && (
                      <div className="mx-4 my-1">
                        <CommentForm
                          onSubmit={({ body, severity }) => {
                            handleAddComment(file.path, lineNo, body, severity || 'suggestion');
                          }}
                          onCancel={() => setCommentFormLine(null)}
                        />
                      </div>
                    )}

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
      ) : (
        <div style={{ height: estimatedHeight }} className="opacity-30 flex items-center justify-center text-sm">
          {file.lineCount} lines
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ diff, files, selectedFile, comments = [], onAddComment, onReplyComment, onResolveComment }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentFormLine, setCommentFormLine] = useState<{ file: string; line: number } | null>(null);

  const { resolved: theme } = useTheme();
  const shikiTheme = theme === 'dark' ? 'github-dark' : 'github-light' as const;

  // Memoize expensive diff parsing
  const parsedFiles = useMemo(() => parseDiff(diff), [diff]);

  // Stable file paths list for the highlighter
  const filePaths = useMemo(() => parsedFiles.map(f => f.path), [parsedFiles]);

  // Initialize shiki highlighter with languages needed for these files
  const { tokenizeLine } = useHighlighter(filePaths);

  // Scroll to selected file when it changes
  useEffect(() => {
    if (selectedFile && fileRefs.current[selectedFile]) {
      fileRefs.current[selectedFile]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedFile]);

  // Memoize comment grouping
  const { commentsByFileLine, repliesByParent } = useMemo(() => {
    const byFileLine = new Map<string, Comment[]>();
    const byParent = new Map<string, Comment[]>();

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const existing = byParent.get(comment.parentCommentId) || [];
        existing.push(comment);
        byParent.set(comment.parentCommentId, existing);
      } else {
        const key = `${comment.filePath}:${comment.startLine}`;
        const existing = byFileLine.get(key) || [];
        existing.push(comment);
        byFileLine.set(key, existing);
      }
    }

    return { commentsByFileLine: byFileLine, repliesByParent: byParent };
  }, [comments]);

  const handleAddComment = useCallback((filePath: string, lineNo: number, body: string, severity: string) => {
    onAddComment?.({ filePath, line: lineNo, body, severity });
    setCommentFormLine(null);
  }, [onAddComment]);

  if (parsedFiles.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm opacity-70">No diff content available.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
      {parsedFiles.map((file) => (
        <div
          key={file.path}
          ref={(el) => { fileRefs.current[file.path] = el; }}
          className="mb-6 border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-sm font-mono font-medium border-b sticky top-0 z-10"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
          >
            {file.path}
          </div>
          <LazyFileDiff
            file={file}
            commentsByFileLine={commentsByFileLine}
            repliesByParent={repliesByParent}
            commentFormLine={commentFormLine}
            setCommentFormLine={setCommentFormLine}
            onAddComment={onAddComment}
            handleAddComment={handleAddComment}
            onReplyComment={onReplyComment}
            onResolveComment={onResolveComment}
            tokenizeLine={tokenizeLine}
            shikiTheme={shikiTheme}
          />
        </div>
      ))}
    </div>
  );
}
