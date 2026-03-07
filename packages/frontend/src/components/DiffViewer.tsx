import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CommentForm } from './CommentForm.js';
import { CommentThread } from './CommentThread.js';
import type { Comment } from './CommentThread.js';
import { useHighlighter, getLangFromPath, type TokenizedLine } from '../hooks/useHighlighter.js';
import { getFileTreeOrder, getGroupedFileOrder } from './fileTreeUtils.js';
import type { ThreadStatus } from '../utils/commentThreadStatus.js';

interface DiffViewerProps {
  diff: string;
  files: string[];
  scrollToFile: string | null;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
  comments?: Comment[];
  threadStatusMap?: Map<string, ThreadStatus>;
  onAddComment?: (data: { filePath: string | null; startLine: number | null; endLine: number | null; body: string; severity: string }) => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onResolveComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
  canEditComments?: boolean;
  globalCommentForm?: boolean;
  onToggleGlobalCommentForm?: () => void;
  fileGroups?: Array<{ name: string; description?: string; files: string[] }> | null;
  viewMode?: 'directory' | 'logical';
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

export type FileStatus = 'added' | 'removed' | 'modified';

interface FileDiff {
  path: string;
  hunks: DiffHunk[];
  lineCount: number;
  additions: number;
  deletions: number;
  status: FileStatus;
}

function parseDiff(rawDiff: string): FileDiff[] {
  if (typeof rawDiff !== 'string') return [];
  const files: FileDiff[] = [];
  const lines = rawDiff.split('\n');
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;
  let fromNull = false;
  let minusPath = '';

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      // Extract path from "diff --git a/path b/path" as fallback for binary files
      const gitPathMatch = line.match(/^diff --git a\/.+ b\/(.+)$/);
      currentFile = { path: gitPathMatch?.[1] ?? '', hunks: [], lineCount: 0, additions: 0, deletions: 0, status: 'modified' };
      currentHunk = null;
      fromNull = false;
      minusPath = '';
    } else if (line.startsWith('--- /dev/null')) {
      fromNull = true;
    } else if (line.startsWith('--- a/')) {
      fromNull = false;
      minusPath = line.slice(6);
    } else if (line.startsWith('+++ /dev/null')) {
      if (currentFile) {
        currentFile.status = 'removed';
        currentFile.path = minusPath;
      }
    } else if (line.startsWith('+++ b/')) {
      if (currentFile) {
        currentFile.path = line.slice(6);
        currentFile.status = fromNull ? 'added' : 'modified';
      }
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
        currentFile.additions++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNo: oldLine++ });
        currentFile.lineCount++;
        currentFile.deletions++;
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
  dragSelection,
  buttonsHidden,
  onLineClick,
  onDragStart,
  onDragOver,
  onFinalizeDrag,
  onCancelComment,
  onAddComment,
  handleAddComment,
  onReplyComment,
  onResolveComment,
  onEditComment,
  onDeleteComment,
  canEditComments,
  commentRangeLines,
  tokenizeLine,
  fileComments,
  fileCommentFormOpen,
  onToggleFileCommentForm,
  onCancelFileComment,
  handleFileComment,
  threadStatusMap,
  orphanedComments,
}: {
  file: FileDiff;
  commentsByFileLine: Map<string, Comment[]>;
  repliesByParent: Map<string, Comment[]>;
  commentFormLine: { file: string; startLine: number; endLine: number } | null;
  dragSelection: { file: string; startLine: number; endLine: number } | null;
  buttonsHidden: boolean;
  onLineClick: (filePath: string, lineNo: number, shiftKey: boolean) => void;
  onDragStart: (filePath: string, lineNo: number) => void;
  onDragOver: (filePath: string, lineNo: number) => void;
  onFinalizeDrag: () => void;
  onCancelComment: () => void;
  onAddComment?: DiffViewerProps['onAddComment'];
  handleAddComment: (filePath: string | null, startLine: number | null, endLine: number | null, body: string, severity: string) => void;
  onReplyComment?: DiffViewerProps['onReplyComment'];
  onResolveComment?: DiffViewerProps['onResolveComment'];
  onEditComment?: DiffViewerProps['onEditComment'];
  onDeleteComment?: DiffViewerProps['onDeleteComment'];
  canEditComments?: boolean;
  commentRangeLines: Set<string>;
  tokenizeLine: (code: string, lang: string) => TokenizedLine | null;
  fileComments: Comment[];
  fileCommentFormOpen: boolean;
  onToggleFileCommentForm: () => void;
  onCancelFileComment: () => void;
  handleFileComment: (filePath: string, body: string, severity: string) => void;
  threadStatusMap?: Map<string, ThreadStatus>;
  orphanedComments: Comment[];
}) {
  const lang = getLangFromPath(file.path);
  const isLarge = file.lineCount > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLarge);
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);

  if (!expanded) {
    return (
      <div
        className="font-mono text-sm px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
        onClick={() => setExpanded(true)}
      >
        <span style={{ opacity: 0.6 }}>
          {file.lineCount} lines — click to expand
        </span>
        <button
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Expand
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* File-level comments section */}
      {(fileComments.length > 0 || fileCommentFormOpen) && (
        <div className="border-b" style={{ borderColor: 'var(--color-border)' }}>
          {fileComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) || []}
              onReply={onReplyComment || (() => {})}
              onResolve={onResolveComment || (() => {})}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              canEdit={canEditComments}
              threadStatus={threadStatusMap?.get(comment.id)}
            />
          ))}
          {fileCommentFormOpen && (
            <div className="mx-4 my-2">
              <div className="text-xs mb-1 opacity-70">Commenting on file</div>
              <CommentForm
                onSubmit={({ body, severity }) => {
                  handleFileComment(file.path, body, severity || 'suggestion');
                }}
                onCancel={onCancelFileComment}
              />
            </div>
          )}
        </div>
      )}
      <div className="font-mono text-sm overflow-x-auto" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
        {isLarge && (
          <div
            className="px-4 py-1 text-xs cursor-pointer flex items-center justify-between"
            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', opacity: 0.6 }}
            onClick={() => setExpanded(false)}
          >
            <span>{file.lineCount} lines</span>
            <button className="text-xs underline">Collapse</button>
          </div>
        )}
        <div className="min-w-fit">
        {file.hunks.map((hunk, hunkIdx) => (
            <div key={hunkIdx}>
              <div className="px-4 py-1 text-xs" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', opacity: 0.6 }}>
                {hunk.header}
              </div>
              {hunk.lines.map((line, lineIdx) => {
                const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
                const lineKey = `${file.path}:${lineNo}`;
                // Use dragSelection for highlighting during drag, otherwise commentFormLine
                const activeRange = dragSelection ?? commentFormLine;
                const isInSelectedRange = activeRange?.file === file.path
                  && lineNo >= activeRange.startLine
                  && lineNo <= activeRange.endLine;
                const isFormOpenAfterThis = commentFormLine?.file === file.path
                  && commentFormLine.endLine === lineNo;
                const isInCommentRange = commentRangeLines.has(lineKey);
                const lineComments = commentsByFileLine.get(lineKey) || [];
                const tokens = tokenizeLine(line.content, lang);

                return (
                  <div key={lineIdx}>
                    <div
                      className="diff-line px-4 py-0 flex relative cursor-pointer"
                      style={{
                        borderLeft: line.type === 'add' ? '3px solid var(--color-diff-add-line)'
                          : line.type === 'remove' ? '3px solid var(--color-diff-remove-line)'
                          : '3px solid transparent',
                        backgroundColor: isInSelectedRange
                          ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                          : isInCommentRange
                          ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)'
                          : undefined,
                      }}
                      onClick={onAddComment ? (e) => onLineClick(file.path, lineNo, e.shiftKey) : undefined}
                      onMouseDown={onAddComment ? (e) => { if (!e.shiftKey) { e.preventDefault(); onDragStart(file.path, lineNo); } } : undefined}
                      onMouseEnter={() => { setHoveredLineKey(`${hunkIdx}:${lineIdx}`); onDragOver(file.path, lineNo); }}
                      onMouseLeave={() => setHoveredLineKey((prev) => prev === `${hunkIdx}:${lineIdx}` ? null : prev)}
                      onMouseUp={onFinalizeDrag}
                    >
                      {onAddComment && !isInSelectedRange && !buttonsHidden && hoveredLineKey === `${hunkIdx}:${lineIdx}` && (
                        <span
                          className="diff-line-btn absolute left-0 top-0 w-5 h-5 flex items-center justify-center text-xs rounded-sm"
                          style={{ backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-accent)', border: '1px solid var(--color-border)', transform: 'translateX(-2px)' }}
                        >
                          +
                        </span>
                      )}
                      <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                        {line.oldLineNo ?? ''}
                      </span>
                      <span className="w-12 text-right pr-2 select-none shrink-0" style={{ color: 'var(--color-text)', opacity: 0.4 }}>
                        {line.newLineNo ?? ''}
                      </span>
                      <span className="w-4 select-none shrink-0" style={{
                        color: line.type === 'add' ? 'var(--color-diff-add-line)' :
                               line.type === 'remove' ? 'var(--color-diff-remove-line)' : 'transparent'
                      }}>
                        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                      </span>
                      <HighlightedContent content={line.content} tokens={tokens} />
                    </div>

                    {isFormOpenAfterThis && onAddComment && (
                      <div className="mx-4 my-1">
                        {commentFormLine.startLine !== commentFormLine.endLine && (
                          <div className="text-xs mb-1 opacity-70">
                            Commenting on lines {commentFormLine.startLine}–{commentFormLine.endLine}
                          </div>
                        )}
                        <CommentForm
                          onSubmit={({ body, severity }) => {
                            handleAddComment(file.path, commentFormLine.startLine, commentFormLine.endLine, body, severity || 'suggestion');
                          }}
                          onCancel={onCancelComment}
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
                        onEdit={onEditComment}
                        onDelete={onDeleteComment}
                        canEdit={canEditComments}
                        threadStatus={threadStatusMap?.get(comment.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      {orphanedComments.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-2 text-xs" style={{ opacity: 0.6, backgroundColor: 'var(--color-bg-secondary)' }}>
            Comments on lines no longer in this diff
          </div>
          {orphanedComments.map((comment) => (
            <div key={comment.id} className="px-4 py-1">
              {comment.startLine != null && (
              <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
                Line{comment.startLine !== comment.endLine && comment.endLine != null
                  ? `s ${comment.startLine}–${comment.endLine}`
                  : ` ${comment.startLine}`}
              </div>
              )}
              <CommentThread
                comment={comment}
                replies={repliesByParent.get(comment.id) || []}
                onReply={onReplyComment || (() => {})}
                onResolve={onResolveComment || (() => {})}
                onEdit={onEditComment}
                onDelete={onDeleteComment}
                canEdit={canEditComments}
                threadStatus={threadStatusMap?.get(comment.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ diff, files, scrollToFile, scrollKey, onVisibleFileChange, comments = [], threadStatusMap, onAddComment, onReplyComment, onResolveComment, onEditComment, onDeleteComment, canEditComments, globalCommentForm, onToggleGlobalCommentForm, fileGroups, viewMode }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [commentFormLine, setCommentFormLine] = useState<{ file: string; startLine: number; endLine: number } | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<{ file: string; line: number } | null>(null);
  const [dragSelection, setDragSelection] = useState<{ file: string; startLine: number; endLine: number } | null>(null);
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const isDragging = useRef(false);
  const dragAnchor = useRef<{ file: string; line: number } | null>(null);
  const isScrolling = useRef(false);
  const [fileCommentFormPath, setFileCommentFormPath] = useState<string | null>(null);

  // Virtualization: track which files are near the viewport
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Store measured heights so placeholders preserve scroll position
  const measuredHeights = useRef<Record<string, number>>({});
  // Force-pinned files (e.g. scrollToFile target) that bypass visibility
  const pinnedRef = useRef<string | null>(null);

  // Memoize expensive diff parsing, sorted to match file tree display order
  const parsedFiles = useMemo(() => {
    const parsed = parseDiff(diff);
    if (viewMode === 'logical' && fileGroups) {
      const groupedOrder = getGroupedFileOrder(fileGroups, files);
      const orderIndex = new Map(groupedOrder.map((f, i) => [f, i]));
      return parsed.sort((a, b) => (orderIndex.get(a.path) ?? Infinity) - (orderIndex.get(b.path) ?? Infinity));
    }
    const treeOrder = getFileTreeOrder(files);
    const orderIndex = new Map(treeOrder.map((f, i) => [f, i]));
    return parsed.sort((a, b) => (orderIndex.get(a.path) ?? Infinity) - (orderIndex.get(b.path) ?? Infinity));
  }, [diff, files, fileGroups, viewMode]);

  // Stable file paths list for the highlighter
  const filePaths = useMemo(() => parsedFiles.map(f => f.path), [parsedFiles]);

  // Map each file to its group for rendering group headers
  const fileToGroup = useMemo(() => {
    if (!fileGroups || viewMode !== 'logical') return null;
    const map = new Map<string, { name: string; description?: string }>();
    for (const group of fileGroups) {
      for (const f of group.files) {
        map.set(f, { name: group.name, description: group.description });
      }
    }
    return map;
  }, [fileGroups, viewMode]);

  // Initialize shiki highlighter with languages needed for these files
  const { tokenizeLine, syntaxTheme, setSyntaxTheme } = useHighlighter(filePaths);

  // Set up IntersectionObserver for virtualizing file diffs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const entry of entries) {
            const path = (entry.target as HTMLElement).dataset.filePath;
            if (!path) continue;
            if (entry.isIntersecting) {
              if (!next.has(path)) { next.add(path); changed = true; }
            } else {
              // Record height before deactivating
              const el = fileRefs.current[path];
              if (el) measuredHeights.current[path] = el.getBoundingClientRect().height;
              if (next.has(path) && path !== pinnedRef.current) { next.delete(path); changed = true; }
            }
          }
          return changed ? next : prev;
        });
      },
      { root: container, rootMargin: '800px 0px' },
    );

    // Observe all file containers
    for (const path of Object.keys(fileRefs.current)) {
      const el = fileRefs.current[path];
      if (el) observerRef.current.observe(el);
    }

    return () => { observerRef.current?.disconnect(); };
  }, [parsedFiles]);

  // Register a file ref and observe it
  const setFileRef = useCallback((path: string, el: HTMLDivElement | null) => {
    const prev = fileRefs.current[path];
    fileRefs.current[path] = el;
    if (el && el !== prev && observerRef.current) {
      observerRef.current.observe(el);
    }
  }, []);

  // Scroll to file on every click (scrollKey changes each time)
  // Pin the target file so it renders before scrolling
  useEffect(() => {
    if (!scrollToFile) return;
    pinnedRef.current = scrollToFile;
    isScrolling.current = true;
    setVisible((prev) => {
      if (prev.has(scrollToFile)) return prev;
      const next = new Set(prev);
      next.add(scrollToFile);
      return next;
    });
    // Initial scroll after React renders the pinned file
    requestAnimationFrame(() => {
      fileRefs.current[scrollToFile]?.scrollIntoView({ block: 'start' });
      // Re-scroll after nearby placeholders expand into real content
      // (their height changes shift the target's position)
      setTimeout(() => {
        fileRefs.current[scrollToFile]?.scrollIntoView({ block: 'start' });
        requestAnimationFrame(() => {
          isScrolling.current = false;
          pinnedRef.current = null;
        });
      }, 150);
    });
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

  // Memoize comment grouping: line comments, file comments, global comments, orphaned comments
  const { commentsByFileLine, fileCommentsByPath, globalComments, repliesByParent, commentRangeLines, orphanedByFile } = useMemo(() => {
    const byFileLine = new Map<string, Comment[]>();
    const byFilePath = new Map<string, Comment[]>();
    const globals: Comment[] = [];
    const byParent = new Map<string, Comment[]>();
    const orphaned = new Map<string, Comment[]>();

    // Build a set of valid line keys from parsed diff
    const validLineKeys = new Set<string>();
    const diffFilePaths = new Set<string>();
    for (const file of parsedFiles) {
      diffFilePaths.add(file.path);
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
          validLineKeys.add(`${file.path}:${lineNo}`);
        }
      }
    }

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const existing = byParent.get(comment.parentCommentId) || [];
        existing.push(comment);
        byParent.set(comment.parentCommentId, existing);
      } else if (comment.filePath == null) {
        // Global/PR-level comment
        globals.push(comment);
      } else if (comment.startLine == null) {
        // File-level comment
        if (diffFilePaths.has(comment.filePath)) {
          const key = `file:${comment.filePath}`;
          const existing = byFilePath.get(key) || [];
          existing.push(comment);
          byFilePath.set(key, existing);
        } else {
          // File not in current diff — treat as orphaned
          const arr = orphaned.get(comment.filePath) || [];
          arr.push(comment);
          orphaned.set(comment.filePath, arr);
        }
      } else {
        // Line-level comment — check if its line exists in the diff
        const key = `${comment.filePath}:${comment.endLine ?? comment.startLine}`;
        if (validLineKeys.has(key)) {
          const existing = byFileLine.get(key) || [];
          existing.push(comment);
          byFileLine.set(key, existing);
        } else {
          // Orphaned: line no longer in this diff
          const arr = orphaned.get(comment.filePath) || [];
          arr.push(comment);
          orphaned.set(comment.filePath, arr);
        }
      }
    }

    const rangeLines = new Set<string>();
    for (const comment of comments) {
      if (!comment.parentCommentId && comment.filePath != null && comment.startLine != null && comment.endLine != null && comment.startLine !== comment.endLine) {
        for (let l = comment.startLine; l <= comment.endLine; l++) {
          rangeLines.add(`${comment.filePath}:${l}`);
        }
      }
    }

    return { commentsByFileLine: byFileLine, fileCommentsByPath: byFilePath, globalComments: globals, repliesByParent: byParent, commentRangeLines: rangeLines, orphanedByFile: orphaned };
  }, [comments, parsedFiles]);

  const handleLineClick = useCallback((filePath: string, lineNo: number, shiftKey: boolean) => {
    // Skip if a real drag just occurred (mousedown + move to different line)
    if (isDragging.current) return;
    if (shiftKey && rangeAnchor && rangeAnchor.file === filePath) {
      const startLine = Math.min(rangeAnchor.line, lineNo);
      const endLine = Math.max(rangeAnchor.line, lineNo);
      setCommentFormLine({ file: filePath, startLine, endLine });
    } else {
      setRangeAnchor({ file: filePath, line: lineNo });
      setCommentFormLine({ file: filePath, startLine: lineNo, endLine: lineNo });
    }
  }, [rangeAnchor]);

  const handleCancelComment = useCallback(() => {
    setCommentFormLine(null);
    setRangeAnchor(null);
    setDragSelection(null);
    setButtonsHidden(true);
  }, []);

  const handleAddComment = useCallback((filePath: string | null, startLine: number | null, endLine: number | null, body: string, severity: string) => {
    onAddComment?.({ filePath, startLine, endLine, body, severity });
    setCommentFormLine(null);
    setRangeAnchor(null);
  }, [onAddComment]);

  const handleFileComment = useCallback((filePath: string, body: string, severity: string) => {
    onAddComment?.({ filePath, startLine: null, endLine: null, body, severity });
    setFileCommentFormPath(null);
  }, [onAddComment]);

  const handleGlobalComment = useCallback((body: string, severity: string) => {
    onAddComment?.({ filePath: null, startLine: null, endLine: null, body, severity });
    onToggleGlobalCommentForm?.();
  }, [onAddComment, onToggleGlobalCommentForm]);

  // Mousedown on "+" button: record anchor in refs only (no state yet).
  // Drag state is set only when mouse moves to a different line.
  const handleDragStart = useCallback((filePath: string, lineNo: number) => {
    dragAnchor.current = { file: filePath, line: lineNo };
  }, []);

  const handleDragOver = useCallback((filePath: string, lineNo: number) => {
    if (!dragAnchor.current || dragAnchor.current.file !== filePath) return;
    // Only activate drag when mouse moves to a different line than the anchor
    if (dragAnchor.current.line === lineNo && !isDragging.current) return;
    isDragging.current = true;
    const start = Math.min(dragAnchor.current.line, lineNo);
    const end = Math.max(dragAnchor.current.line, lineNo);
    setDragSelection({ file: filePath, startLine: start, endLine: end });
  }, []);

  const finalizeDrag = useCallback(() => {
    const wasDragging = isDragging.current;
    isDragging.current = false;
    dragAnchor.current = null;
    if (wasDragging) {
      // Move drag selection to comment form
      setDragSelection((sel) => {
        if (sel) {
          setCommentFormLine(sel);
          setRangeAnchor({ file: sel.file, line: sel.startLine });
        }
        return null;
      });
    } else {
      setDragSelection(null);
    }
  }, []);

  // Attach a global mouseup listener so drag ends even if mouse leaves the gutter
  useEffect(() => {
    const onMouseUp = () => {
      if (dragAnchor.current) finalizeDrag();
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [finalizeDrag]);

  if (parsedFiles.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm opacity-70">No diff content available.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4" onMouseMove={buttonsHidden ? () => setButtonsHidden(false) : undefined}>
      {/* Global/PR-level comments */}
      {(globalComments.length > 0 || globalCommentForm) && (
        <div className="mb-6 border rounded overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="px-4 py-2 text-sm font-medium border-b flex items-center gap-2"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
          >
            <span className="px-1.5 py-0.5 rounded text-xs" style={{
              backgroundColor: 'rgba(130, 80, 223, 0.15)',
              color: '#8250df',
            }}>PR</span>
            General comments
          </div>
          {globalComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) || []}
              onReply={onReplyComment || (() => {})}
              onResolve={onResolveComment || (() => {})}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              canEdit={canEditComments}
              threadStatus={threadStatusMap?.get(comment.id)}
            />
          ))}
          {globalCommentForm && (
            <div className="mx-4 my-2">
              <CommentForm
                onSubmit={({ body, severity }) => {
                  handleGlobalComment(body, severity || 'suggestion');
                }}
                onCancel={() => onToggleGlobalCommentForm?.()}
              />
            </div>
          )}
        </div>
      )}

      {parsedFiles.map((file, idx) => (
        <div key={file.path}>
          {(() => {
            if (!fileToGroup) return null;
            const group = fileToGroup.get(file.path);
            const prevFile = idx > 0 ? parsedFiles[idx - 1] : null;
            const prevGroup = prevFile ? fileToGroup.get(prevFile.path) : null;
            const isNewGroup = group && (!prevGroup || prevGroup.name !== group.name);
            const isUngrouped = !group && (idx === 0 || (prevFile && fileToGroup.has(prevFile.path)));
            if (isNewGroup) {
              return (
                <div className="px-4 py-3 mb-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-surface))' }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{group.name}</div>
                  {group.description && (
                    <div className="text-xs mt-0.5 opacity-60">{group.description}</div>
                  )}
                </div>
              );
            }
            if (isUngrouped) {
              return (
                <div className="px-4 py-3 mb-2 border-b" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-surface))' }}>
                  <div className="text-sm font-semibold opacity-60">Other Changes</div>
                </div>
              );
            }
            return null;
          })()}
        <div
          ref={(el) => { setFileRef(file.path, el); }}
          data-file-path={file.path}
          className="mb-6 border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-sm font-mono font-medium border-b sticky top-0 z-10 flex items-center justify-between gap-4"
            style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
          >
            <span className="truncate">{file.path}</span>
            <span className="shrink-0 flex gap-2 text-xs items-center">
              {onAddComment && (
                <button
                  onClick={() => setFileCommentFormPath(fileCommentFormPath === file.path ? null : file.path)}
                  className="px-2 py-0.5 rounded border hover:opacity-80"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
                  title="Comment on file"
                >
                  Comment
                </button>
              )}
              {file.additions > 0 && (
                <span style={{ color: 'var(--color-diff-add-line)' }}>+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span style={{ color: 'var(--color-diff-remove-line)' }}>-{file.deletions}</span>
              )}
            </span>
          </div>
          {visible.has(file.path) ? (
            <FileDiff
              file={file}
              commentsByFileLine={commentsByFileLine}
              repliesByParent={repliesByParent}
              commentFormLine={commentFormLine}
              dragSelection={dragSelection}
              buttonsHidden={buttonsHidden}
              onLineClick={handleLineClick}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onFinalizeDrag={finalizeDrag}
              onCancelComment={handleCancelComment}
              onAddComment={onAddComment}
              handleAddComment={handleAddComment}
              onReplyComment={onReplyComment}
              onResolveComment={onResolveComment}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              canEditComments={canEditComments}
              commentRangeLines={commentRangeLines}
              tokenizeLine={tokenizeLine}
              fileComments={fileCommentsByPath.get(`file:${file.path}`) || []}
              fileCommentFormOpen={fileCommentFormPath === file.path}
              onToggleFileCommentForm={() => setFileCommentFormPath(fileCommentFormPath === file.path ? null : file.path)}
              onCancelFileComment={() => setFileCommentFormPath(null)}
              handleFileComment={handleFileComment}
              threadStatusMap={threadStatusMap}
              orphanedComments={orphanedByFile.get(file.path) || []}
            />
          ) : (
            <div
              className="font-mono text-sm px-4 py-3"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                opacity: 0.5,
                height: measuredHeights.current[file.path]
                  ? measuredHeights.current[file.path] - 37
                  : Math.min(file.lineCount * 20, 200),
              }}
            >
              {file.lineCount} lines
            </div>
          )}
        </div>
        </div>
      ))}

      {/* Orphaned comments on files no longer in the diff */}
      {Array.from(orphanedByFile.entries())
        .filter(([filePath]) => !parsedFiles.some(f => f.path === filePath))
        .map(([filePath, orphanedComments]) => (
          <div
            key={`orphaned-${filePath}`}
            className="mb-6 border rounded overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="px-4 py-2 text-sm font-mono font-medium border-b"
              style={{ backgroundColor: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}
            >
              <span className="truncate">{filePath}</span>
              <span className="ml-2 text-xs" style={{ opacity: 0.6 }}>(not in current diff)</span>
            </div>
            <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="px-4 py-2 text-xs" style={{ opacity: 0.6, backgroundColor: 'var(--color-bg-secondary)' }}>
                Comments on lines no longer in this diff
              </div>
              {orphanedComments.map((comment) => (
                <div key={comment.id} className="px-4 py-1">
                  {comment.startLine != null && (
                  <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
                    Line{comment.startLine !== comment.endLine && comment.endLine != null
                      ? `s ${comment.startLine}–${comment.endLine}`
                      : ` ${comment.startLine}`}
                  </div>
                  )}
                  <CommentThread
                    comment={comment}
                    replies={repliesByParent.get(comment.id) || []}
                    onReply={onReplyComment || (() => {})}
                    onResolve={onResolveComment || (() => {})}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    canEdit={canEditComments}
                    threadStatus={threadStatusMap?.get(comment.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))
      }
    </div>
  );
}
