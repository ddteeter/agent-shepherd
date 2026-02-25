import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CommentForm } from './CommentForm.js';
import { CommentThread } from './CommentThread.js';
import type { Comment } from './CommentThread.js';
import { useHighlighter, getLangFromPath, type TokenizedLine } from '../hooks/useHighlighter.js';

interface DiffViewerProps {
  diff: string;
  files: string[];
  scrollToFile: string | null;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
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

const COLLAPSE_THRESHOLD = 200;

/** Renders a single file's diff, with large files collapsed by default */
function FileDiff({
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
  themeBg,
  themeFg,
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
  tokenizeLine: (code: string, lang: string) => TokenizedLine | null;
  themeBg?: string;
  themeFg?: string;
}) {
  const lang = getLangFromPath(file.path);
  const isLarge = file.lineCount > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLarge);

  if (!expanded) {
    return (
      <div
        className="font-mono text-sm px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{ backgroundColor: themeBg, color: themeFg }}
        onClick={() => setExpanded(true)}
      >
        <span style={{ opacity: 0.6 }}>
          {file.lineCount} lines — click to expand
        </span>
        <button
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: themeFg ? `${themeFg}33` : 'var(--color-border)', color: themeFg }}
        >
          Expand
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-sm" style={{ backgroundColor: themeBg, color: themeFg }}>
        {isLarge && (
          <div
            className="px-4 py-1 text-xs cursor-pointer flex items-center justify-between"
            style={{ backgroundColor: themeBg, color: themeFg, opacity: 0.6 }}
            onClick={() => setExpanded(false)}
          >
            <span>{file.lineCount} lines</span>
            <button className="text-xs underline">Collapse</button>
          </div>
        )}
        {file.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div className="px-4 py-1 text-xs" style={{ backgroundColor: themeBg, color: themeFg, opacity: 0.6 }}>
                {hunk.header}
              </div>
              {hunk.lines.map((line, lineIdx) => {
                const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
                const isFormOpen = commentFormLine?.file === file.path && commentFormLine?.line === lineNo;
                const lineComments = commentsByFileLine.get(`${file.path}:${lineNo}`) || [];
                const tokens = tokenizeLine(line.content, lang);

                return (
                  <div key={lineIdx}>
                    <div
                      className="diff-line px-4 py-0 flex relative"
                      style={{
                        borderLeft: line.type === 'add' ? '3px solid #3fb950'
                          : line.type === 'remove' ? '3px solid #f85149'
                          : '3px solid transparent',
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
                      <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: themeFg, opacity: 0.4 }}>
                        {line.oldLineNo ?? ''}
                      </span>
                      <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: themeFg, opacity: 0.4 }}>
                        {line.newLineNo ?? ''}
                      </span>
                      <span className="w-4 select-none shrink-0" style={{
                        color: line.type === 'add' ? '#3fb950' :
                               line.type === 'remove' ? '#f85149' : 'transparent'
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
    </div>
  );
}

export function DiffViewer({ diff, files, scrollToFile, scrollKey, onVisibleFileChange, comments = [], onAddComment, onReplyComment, onResolveComment }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentFormLine, setCommentFormLine] = useState<{ file: string; line: number } | null>(null);
  const isScrolling = useRef(false);

  // Memoize expensive diff parsing
  const parsedFiles = useMemo(() => parseDiff(diff), [diff]);

  // Stable file paths list for the highlighter
  const filePaths = useMemo(() => parsedFiles.map(f => f.path), [parsedFiles]);

  // Initialize shiki highlighter with languages needed for these files
  const { tokenizeLine, syntaxTheme, setSyntaxTheme, themeBg, themeFg } = useHighlighter(filePaths);

  // Scroll to file on every click (scrollKey changes each time)
  useEffect(() => {
    if (scrollToFile && fileRefs.current[scrollToFile]) {
      isScrolling.current = true;
      fileRefs.current[scrollToFile]?.scrollIntoView({ block: 'start' });
      // Allow one frame for the scroll to complete before re-enabling tracking
      requestAnimationFrame(() => { isScrolling.current = false; });
    }
  }, [scrollToFile, scrollKey]);

  // Track which file is visible via scroll position and sync sidebar
  useEffect(() => {
    const container = containerRef.current;
    if (!onVisibleFileChange || !container) return;

    let rafId: number;
    const handleScroll = () => {
      if (isScrolling.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const containerTop = container.getBoundingClientRect().top;
        let closest: string | null = null;
        let closestDist = Infinity;
        for (const file of parsedFiles) {
          const el = fileRefs.current[file.path];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          // File is visible if its top is above container bottom and bottom is below container top
          if (rect.bottom > containerTop && rect.top < containerTop + container.clientHeight) {
            const dist = Math.abs(rect.top - containerTop);
            if (dist < closestDist) {
              closestDist = dist;
              closest = file.path;
            }
          }
        }
        if (closest) onVisibleFileChange(closest);
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [parsedFiles, onVisibleFileChange]);

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
          data-file-path={file.path}
          className="mb-6 border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-sm font-mono font-medium border-b sticky top-0 z-10"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
          >
            {file.path}
          </div>
          <FileDiff
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
            themeBg={themeBg}
            themeFg={themeFg}
          />
        </div>
      ))}
    </div>
  );
}
