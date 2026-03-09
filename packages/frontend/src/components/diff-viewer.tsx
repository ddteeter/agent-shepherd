import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { CommentForm } from './comment-form.js';
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import {
  useHighlighter,
  getLangFromPath,
  type TokenizedLine,
} from '../hooks/use-highlighter.js';
import {
  getFileTreeOrder,
  getGroupedFileOrder,
} from './file-tree-utilities.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

/** Typed wrapper for Array.prototype.toSorted since TS target < ES2023 */
function sortedCopy<T>(
  array: T[],
  compareFunction: (a: T, b: T) => number,
): T[] {
  return (
    array as unknown as {
      toSorted: (sortFunction: (a: T, b: T) => number) => T[];
    }
  ).toSorted(compareFunction);
}

interface DiffViewerProperties {
  diff: string;
  files: string[];
  scrollToFile: string | undefined;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
  comments?: Comment[];
  threadStatusMap?: Map<string, ThreadStatus>;
  onAddComment?: (data: {
    filePath: string | undefined;
    startLine: number | undefined;
    endLine: number | undefined;
    body: string;
    severity: string;
  }) => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onResolveComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
  canEditComments?: boolean;
  globalCommentForm?: boolean;
  onToggleGlobalCommentForm?: () => void;
  fileGroups?:
    | {
        name: string;
        description?: string;
        files: string[];
      }[]
    | undefined;
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

interface FileDiffData {
  path: string;
  hunks: DiffHunk[];
  lineCount: number;
  additions: number;
  deletions: number;
  status: FileStatus;
}

function parseDiff(rawDiff: string): FileDiffData[] {
  if (typeof rawDiff !== 'string') return [];
  const files: FileDiffData[] = [];
  const lines = rawDiff.split('\n');
  let currentFile: FileDiffData | undefined;
  let currentHunk: DiffHunk | undefined;
  let oldLine = 0;
  let newLine = 0;
  let fromNull = false;
  let minusPath = '';

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      const gitPathMatch = /^diff --git a\/.+ b\/(.+)$/.exec(line);
      currentFile = {
        path: gitPathMatch?.[1] ?? '',
        hunks: [],
        lineCount: 0,
        additions: 0,
        deletions: 0,
        status: 'modified',
      };
      currentHunk = undefined;
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
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (match) {
        oldLine = Number.parseInt(match[1], 10);
        newLine = Number.parseInt(match[2], 10);
      }
      currentHunk = { header: line, lines: [] };
      if (currentFile) currentFile.hunks.push(currentHunk);
    } else if (currentHunk && currentFile) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'add',
          content: line.slice(1),
          newLineNo: newLine,
        });
        newLine++;
        currentFile.lineCount++;
        currentFile.additions++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'remove',
          content: line.slice(1),
          oldLineNo: oldLine,
        });
        oldLine++;
        currentFile.lineCount++;
        currentFile.deletions++;
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNo: oldLine,
          newLineNo: newLine,
        });
        oldLine++;
        newLine++;
        currentFile.lineCount++;
      }
    }
  }

  if (currentFile) files.push(currentFile);
  return files;
}

function HighlightedContent({
  content,
  tokens,
}: {
  content: string;
  tokens: TokenizedLine | undefined;
}) {
  if (!tokens || tokens.length === 0) {
    return <span className="whitespace-pre">{content}</span>;
  }
  return (
    <span className="whitespace-pre">
      {tokens.map((token, index) => (
        <span key={index} style={{ color: token.color }}>
          {token.content}
        </span>
      ))}
    </span>
  );
}

const COLLAPSE_THRESHOLD = 200;

function noopCallback() {
  // intentional no-op: used as default callback for optional handlers
}

function FileDiffComponent({
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
  onCancelFileComment,
  handleFileComment,
  threadStatusMap,
  orphanedComments,
}: {
  file: FileDiffData;
  commentsByFileLine: Map<string, Comment[]>;
  repliesByParent: Map<string, Comment[]>;
  commentFormLine:
    | { file: string; startLine: number; endLine: number }
    | undefined;
  dragSelection:
    | { file: string; startLine: number; endLine: number }
    | undefined;
  buttonsHidden: boolean;
  onLineClick: (filePath: string, lineNo: number, shiftKey: boolean) => void;
  onDragStart: (filePath: string, lineNo: number) => void;
  onDragOver: (filePath: string, lineNo: number) => void;
  onFinalizeDrag: () => void;
  onCancelComment: () => void;
  onAddComment?: DiffViewerProperties['onAddComment'];
  handleAddComment: (
    filePath: string | undefined,
    startLine: number | undefined,
    endLine: number | undefined,
    body: string,
    severity: string,
  ) => void;
  onReplyComment?: DiffViewerProperties['onReplyComment'];
  onResolveComment?: DiffViewerProperties['onResolveComment'];
  onEditComment?: DiffViewerProperties['onEditComment'];
  onDeleteComment?: DiffViewerProperties['onDeleteComment'];
  canEditComments?: boolean;
  commentRangeLines: Set<string>;
  tokenizeLine: (code: string, lang: string) => TokenizedLine | undefined;
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
  const [hoveredLineKey, setHoveredLineKey] = useState<string | undefined>();

  if (!expanded) {
    return (
      <div
        className="font-mono text-sm px-4 py-3 flex items-center justify-between cursor-pointer"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
        onClick={() => {
          setExpanded(true);
        }}
      >
        <span style={{ opacity: 0.6 }}>
          {file.lineCount} lines — click to expand
        </span>
        <button
          className="text-xs px-2 py-1 rounded border"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
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
        <div
          className="border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {fileComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) ?? []}
              onReply={onReplyComment ?? noopCallback}
              onResolve={onResolveComment ?? noopCallback}
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
                  handleFileComment(file.path, body, severity ?? 'suggestion');
                }}
                onCancel={onCancelFileComment}
              />
            </div>
          )}
        </div>
      )}
      <div
        className="font-mono text-sm overflow-x-auto"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      >
        {isLarge && (
          <div
            className="px-4 py-1 text-xs cursor-pointer flex items-center justify-between"
            style={{
              backgroundColor: 'var(--color-bg)',
              color: 'var(--color-text)',
              opacity: 0.6,
            }}
            onClick={() => {
              setExpanded(false);
            }}
          >
            <span>{file.lineCount} lines</span>
            <button className="text-xs underline">Collapse</button>
          </div>
        )}
        <div className="min-w-fit">
          {file.hunks.map((hunk, hunkIndex) => (
            <div key={hunkIndex}>
              <div
                className="px-4 py-1 text-xs"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  opacity: 0.6,
                }}
              >
                {hunk.header}
              </div>
              {hunk.lines.map((line, lineIndex) => {
                const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
                const lineKey = `${file.path}:${String(lineNo)}`;
                const activeRange = dragSelection ?? commentFormLine;
                const isInSelectedRange =
                  activeRange?.file === file.path &&
                  lineNo >= activeRange.startLine &&
                  lineNo <= activeRange.endLine;
                const isFormOpenAfterThis =
                  commentFormLine?.file === file.path &&
                  commentFormLine.endLine === lineNo;
                const isInCommentRange = commentRangeLines.has(lineKey);
                const lineComments = commentsByFileLine.get(lineKey) ?? [];
                const tokens = tokenizeLine(line.content, lang);

                return (
                  <div key={lineIndex}>
                    <div
                      className="diff-line px-4 py-0 flex relative cursor-pointer"
                      style={{
                        borderLeft:
                          line.type === 'add'
                            ? '3px solid var(--color-diff-add-line)'
                            : line.type === 'remove'
                              ? '3px solid var(--color-diff-remove-line)'
                              : '3px solid transparent',
                        backgroundColor: isInSelectedRange
                          ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)'
                          : isInCommentRange
                            ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)'
                            : undefined,
                      }}
                      onClick={
                        onAddComment
                          ? (event) => {
                              onLineClick(file.path, lineNo, event.shiftKey);
                            }
                          : undefined
                      }
                      onMouseDown={
                        onAddComment
                          ? (event) => {
                              if (!event.shiftKey) {
                                event.preventDefault();
                                onDragStart(file.path, lineNo);
                              }
                            }
                          : undefined
                      }
                      onMouseEnter={() => {
                        setHoveredLineKey(
                          `${String(hunkIndex)}:${String(lineIndex)}`,
                        );
                        onDragOver(file.path, lineNo);
                      }}
                      onMouseLeave={() => {
                        setHoveredLineKey((previous) =>
                          previous ===
                          `${String(hunkIndex)}:${String(lineIndex)}`
                            ? undefined
                            : previous,
                        );
                      }}
                      onMouseUp={onFinalizeDrag}
                    >
                      {onAddComment &&
                        !isInSelectedRange &&
                        !buttonsHidden &&
                        hoveredLineKey ===
                          `${String(hunkIndex)}:${String(lineIndex)}` && (
                          <span
                            className="diff-line-btn absolute left-0 top-0 w-5 h-5 flex items-center justify-center text-xs rounded-sm"
                            style={{
                              backgroundColor: 'var(--color-bg-secondary)',
                              color: 'var(--color-accent)',
                              border: '1px solid var(--color-border)',
                              transform: 'translateX(-2px)',
                            }}
                          >
                            +
                          </span>
                        )}
                      <span
                        className="w-12 text-right pr-2 select-none shrink-0"
                        style={{ color: 'var(--color-text)', opacity: 0.4 }}
                      >
                        {line.oldLineNo ?? ''}
                      </span>
                      <span
                        className="w-12 text-right pr-2 select-none shrink-0"
                        style={{ color: 'var(--color-text)', opacity: 0.4 }}
                      >
                        {line.newLineNo ?? ''}
                      </span>
                      <span
                        className="w-4 select-none shrink-0"
                        style={{
                          color:
                            line.type === 'add'
                              ? 'var(--color-diff-add-line)'
                              : line.type === 'remove'
                                ? 'var(--color-diff-remove-line)'
                                : 'transparent',
                        }}
                      >
                        {line.type === 'add'
                          ? '+'
                          : line.type === 'remove'
                            ? '-'
                            : ' '}
                      </span>
                      <HighlightedContent
                        content={line.content}
                        tokens={tokens}
                      />
                    </div>

                    {isFormOpenAfterThis && onAddComment && (
                      <div className="mx-4 my-1">
                        {commentFormLine.startLine !==
                          commentFormLine.endLine && (
                          <div className="text-xs mb-1 opacity-70">
                            Commenting on lines {commentFormLine.startLine}–
                            {commentFormLine.endLine}
                          </div>
                        )}
                        <CommentForm
                          onSubmit={({ body, severity }) => {
                            handleAddComment(
                              file.path,
                              commentFormLine.startLine,
                              commentFormLine.endLine,
                              body,
                              severity ?? 'suggestion',
                            );
                          }}
                          onCancel={onCancelComment}
                        />
                      </div>
                    )}

                    {lineComments.map((comment) => (
                      <CommentThread
                        key={comment.id}
                        comment={comment}
                        replies={repliesByParent.get(comment.id) ?? []}
                        onReply={onReplyComment ?? noopCallback}
                        onResolve={onResolveComment ?? noopCallback}
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
        <div
          className="border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-xs"
            style={{
              opacity: 0.6,
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            Comments on lines no longer in this diff
          </div>
          {orphanedComments.map((comment) => (
            <div key={comment.id} className="px-4 py-1">
              {comment.startLine !== undefined && (
                <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
                  Line
                  {comment.startLine !== comment.endLine &&
                  comment.endLine !== undefined
                    ? `s ${String(comment.startLine)}–${String(comment.endLine)}`
                    : ` ${String(comment.startLine)}`}
                </div>
              )}
              <CommentThread
                comment={comment}
                replies={repliesByParent.get(comment.id) ?? []}
                onReply={onReplyComment ?? noopCallback}
                onResolve={onResolveComment ?? noopCallback}
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

export function DiffViewer({
  diff,
  files,
  scrollToFile,
  scrollKey,
  onVisibleFileChange,
  comments = [],
  threadStatusMap,
  onAddComment,
  onReplyComment,
  onResolveComment,
  onEditComment,
  onDeleteComment,
  canEditComments,
  globalCommentForm,
  onToggleGlobalCommentForm,
  fileGroups,
  viewMode,
}: DiffViewerProperties) {
  const containerReference = useRef<HTMLDivElement>(undefined);
  const fileReferences = useRef<Record<string, HTMLDivElement | undefined>>({});
  const [commentFormLine, setCommentFormLine] = useState<
    | {
        file: string;
        startLine: number;
        endLine: number;
      }
    | undefined
  >();
  const [rangeAnchor, setRangeAnchor] = useState<
    | {
        file: string;
        line: number;
      }
    | undefined
  >();
  const [dragSelection, setDragSelection] = useState<
    | {
        file: string;
        startLine: number;
        endLine: number;
      }
    | undefined
  >();
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const isDragging = useRef(false);
  const dragAnchor = useRef<{ file: string; line: number } | undefined>(
    undefined,
  );
  const isScrolling = useRef(false);
  const [fileCommentFormPath, setFileCommentFormPath] = useState<
    string | undefined
  >();

  const [visible, setVisible] = useState<Set<string>>(new Set());
  const observerReference = useRef<IntersectionObserver | undefined>(undefined);
  const [measuredHeights, setMeasuredHeights] = useState<
    Record<string, number>
  >({});
  const pinnedReference = useRef<string | undefined>(undefined);

  const parsedFiles = useMemo(() => {
    const parsed = parseDiff(diff);
    if (viewMode === 'logical' && fileGroups) {
      const groupedOrder = getGroupedFileOrder(fileGroups, files);
      const orderIndex = new Map(
        groupedOrder.map((filePath: string, index: number) => [
          filePath,
          index,
        ]),
      );
      return sortedCopy(
        parsed,
        (a, b) =>
          (orderIndex.get(a.path) ?? Number.POSITIVE_INFINITY) -
          (orderIndex.get(b.path) ?? Number.POSITIVE_INFINITY),
      );
    }
    const treeOrder = getFileTreeOrder(files);
    const orderIndex = new Map(
      treeOrder.map((filePath: string, index: number) => [filePath, index]),
    );
    return sortedCopy(
      parsed,
      (a, b) =>
        (orderIndex.get(a.path) ?? Number.POSITIVE_INFINITY) -
        (orderIndex.get(b.path) ?? Number.POSITIVE_INFINITY),
    );
  }, [diff, files, fileGroups, viewMode]);

  const filePaths = useMemo(
    () => parsedFiles.map((f) => f.path),
    [parsedFiles],
  );

  const fileToGroup = useMemo(() => {
    if (!fileGroups || viewMode !== 'logical') return;
    const map = new Map<string, { name: string; description?: string }>();
    for (const group of fileGroups) {
      for (const f of group.files) {
        map.set(f, { name: group.name, description: group.description });
      }
    }
    return map;
  }, [fileGroups, viewMode]);

  const { tokenizeLine } = useHighlighter(filePaths);

  useEffect(() => {
    const container = containerReference.current;
    if (!container) return;

    observerReference.current = new IntersectionObserver(
      (entries) => {
        setVisible((previous) => {
          const next = new Set(previous);
          let changed = false;
          for (const entry of entries) {
            const path = (entry.target as HTMLElement).dataset.filePath;
            if (!path) continue;
            if (entry.isIntersecting) {
              if (!next.has(path)) {
                next.add(path);
                changed = true;
              }
            } else {
              const element = fileReferences.current[path];
              if (element) {
                const height = element.getBoundingClientRect().height;
                setMeasuredHeights((previous) => ({
                  ...previous,
                  [path]: height,
                }));
              }
              if (next.has(path) && path !== pinnedReference.current) {
                next.delete(path);
                changed = true;
              }
            }
          }
          return changed ? next : previous;
        });
      },
      { root: container, rootMargin: '800px 0px' },
    );

    for (const path of Object.keys(fileReferences.current)) {
      const element = fileReferences.current[path];
      if (element) observerReference.current.observe(element);
    }

    return () => {
      observerReference.current?.disconnect();
    };
  }, [parsedFiles]);

  const createFileReferenceCallback = useCallback(
    (filePath: string) => (element: HTMLDivElement | null) => {
      fileReferences.current[filePath] = element ?? undefined;
      if (element && observerReference.current) {
        observerReference.current.observe(element);
      }
    },
    [],
  );

  // Ensure scrollToFile is visible before scrolling
  if (scrollToFile && !visible.has(scrollToFile)) {
    setVisible((previous) => {
      if (previous.has(scrollToFile)) return previous;
      const next = new Set(previous);
      next.add(scrollToFile);
      return next;
    });
  }

  useEffect(() => {
    if (!scrollToFile) return;
    pinnedReference.current = scrollToFile;
    isScrolling.current = true;
    requestAnimationFrame(() => {
      fileReferences.current[scrollToFile]?.scrollIntoView({ block: 'start' });
      setTimeout(() => {
        fileReferences.current[scrollToFile]?.scrollIntoView({
          block: 'start',
        });
        requestAnimationFrame(() => {
          isScrolling.current = false;
          pinnedReference.current = undefined;
        });
      }, 150);
    });
  }, [scrollToFile, scrollKey]);

  useEffect(() => {
    const container = containerReference.current;
    if (!onVisibleFileChange || !container) return;

    let rafId: number;
    const handleScroll = () => {
      if (isScrolling.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const containerTop = container.getBoundingClientRect().top;
        let closest: string | undefined;
        let closestDistribution = Number.POSITIVE_INFINITY;
        for (const file of parsedFiles) {
          const element = fileReferences.current[file.path];
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          if (
            rect.bottom > containerTop &&
            rect.top < containerTop + container.clientHeight
          ) {
            const distribution = Math.abs(rect.top - containerTop);
            if (distribution < closestDistribution) {
              closestDistribution = distribution;
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

  const {
    commentsByFileLine,
    fileCommentsByPath,
    globalComments,
    repliesByParent,
    commentRangeLines,
    orphanedByFile,
  } = useMemo(() => {
    const byFileLine = new Map<string, Comment[]>();
    const byFilePath = new Map<string, Comment[]>();
    const globals: Comment[] = [];
    const byParent = new Map<string, Comment[]>();
    const orphaned = new Map<string, Comment[]>();

    const validLineKeys = new Set<string>();
    const diffFilePaths = new Set<string>();
    for (const file of parsedFiles) {
      diffFilePaths.add(file.path);
      for (const hunk of file.hunks) {
        for (const line of hunk.lines) {
          const lineNo = line.newLineNo ?? line.oldLineNo ?? 0;
          validLineKeys.add(`${file.path}:${String(lineNo)}`);
        }
      }
    }

    for (const comment of comments) {
      if (comment.parentCommentId) {
        const existing = byParent.get(comment.parentCommentId) ?? [];
        existing.push(comment);
        byParent.set(comment.parentCommentId, existing);
      } else if (comment.filePath === undefined) {
        globals.push(comment);
      } else if (comment.startLine === undefined) {
        if (diffFilePaths.has(comment.filePath)) {
          const key = `file:${comment.filePath}`;
          const existing = byFilePath.get(key) ?? [];
          existing.push(comment);
          byFilePath.set(key, existing);
        } else {
          const array = orphaned.get(comment.filePath) ?? [];
          array.push(comment);
          orphaned.set(comment.filePath, array);
        }
      } else {
        const key = `${comment.filePath}:${String(comment.endLine ?? comment.startLine)}`;
        if (validLineKeys.has(key)) {
          const existing = byFileLine.get(key) ?? [];
          existing.push(comment);
          byFileLine.set(key, existing);
        } else {
          const array = orphaned.get(comment.filePath) ?? [];
          array.push(comment);
          orphaned.set(comment.filePath, array);
        }
      }
    }

    const rangeLines = new Set<string>();
    for (const comment of comments) {
      if (
        !comment.parentCommentId &&
        comment.filePath !== undefined &&
        comment.startLine !== undefined &&
        comment.endLine !== undefined &&
        comment.startLine !== comment.endLine
      ) {
        for (let l = comment.startLine; l <= comment.endLine; l++) {
          rangeLines.add(`${comment.filePath}:${String(l)}`);
        }
      }
    }

    return {
      commentsByFileLine: byFileLine,
      fileCommentsByPath: byFilePath,
      globalComments: globals,
      repliesByParent: byParent,
      commentRangeLines: rangeLines,
      orphanedByFile: orphaned,
    };
  }, [comments, parsedFiles]);

  const handleLineClick = useCallback(
    (filePath: string, lineNo: number, shiftKey: boolean) => {
      if (isDragging.current) return;
      if (shiftKey && rangeAnchor?.file === filePath) {
        const startLine = Math.min(rangeAnchor.line, lineNo);
        const endLine = Math.max(rangeAnchor.line, lineNo);
        setCommentFormLine({ file: filePath, startLine, endLine });
      } else {
        setRangeAnchor({ file: filePath, line: lineNo });
        setCommentFormLine({
          file: filePath,
          startLine: lineNo,
          endLine: lineNo,
        });
      }
    },
    [rangeAnchor],
  );

  const handleCancelComment = useCallback(() => {
    setCommentFormLine(undefined);
    setRangeAnchor(undefined);
    setDragSelection(undefined);
    setButtonsHidden(true);
  }, []);

  const handleAddComment = useCallback(
    (
      filePath: string | undefined,
      startLine: number | undefined,
      endLine: number | undefined,
      body: string,
      severity: string,
    ) => {
      onAddComment?.({ filePath, startLine, endLine, body, severity });
      setCommentFormLine(undefined);
      setRangeAnchor(undefined);
    },
    [onAddComment],
  );

  const handleFileComment = useCallback(
    (filePath: string, body: string, severity: string) => {
      onAddComment?.({
        filePath,
        startLine: undefined,
        endLine: undefined,
        body,
        severity,
      });
      setFileCommentFormPath(undefined);
    },
    [onAddComment],
  );

  const handleGlobalComment = useCallback(
    (body: string, severity: string) => {
      onAddComment?.({
        filePath: undefined,
        startLine: undefined,
        endLine: undefined,
        body,
        severity,
      });
      onToggleGlobalCommentForm?.();
    },
    [onAddComment, onToggleGlobalCommentForm],
  );

  const handleDragStart = useCallback((filePath: string, lineNo: number) => {
    dragAnchor.current = { file: filePath, line: lineNo };
  }, []);

  const handleDragOver = useCallback((filePath: string, lineNo: number) => {
    if (dragAnchor.current?.file !== filePath) return;
    if (dragAnchor.current.line === lineNo && !isDragging.current) return;
    isDragging.current = true;
    const start = Math.min(dragAnchor.current.line, lineNo);
    const end = Math.max(dragAnchor.current.line, lineNo);
    setDragSelection({ file: filePath, startLine: start, endLine: end });
  }, []);

  const finalizeDrag = useCallback(() => {
    const wasDragging = isDragging.current;
    isDragging.current = false;
    dragAnchor.current = undefined;
    if (wasDragging) {
      setDragSelection((sel) => {
        if (sel) {
          setCommentFormLine(sel);
          setRangeAnchor({ file: sel.file, line: sel.startLine });
        }
        // Keep current selection (cleared by next mouse interaction)
        return sel;
      });
    }
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      if (dragAnchor.current) finalizeDrag();
    };
    globalThis.addEventListener('mouseup', onMouseUp);
    return () => {
      globalThis.removeEventListener('mouseup', onMouseUp);
    };
  }, [finalizeDrag]);

  if (parsedFiles.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm opacity-70">No diff content available.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerReference as React.RefObject<HTMLDivElement>}
      className="flex-1 overflow-y-auto p-4"
      onMouseMove={
        buttonsHidden
          ? () => {
              setButtonsHidden(false);
            }
          : undefined
      }
    >
      {/* Global/PR-level comments */}
      {(globalComments.length > 0 || globalCommentForm) && (
        <div
          className="mb-6 border rounded overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div
            className="px-4 py-2 text-sm font-medium border-b flex items-center gap-2"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              borderColor: 'var(--color-border)',
            }}
          >
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                backgroundColor: 'rgba(130, 80, 223, 0.15)',
                color: '#8250df',
              }}
            >
              PR
            </span>
            General comments
          </div>
          {globalComments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={repliesByParent.get(comment.id) ?? []}
              onReply={onReplyComment ?? noopCallback}
              onResolve={onResolveComment ?? noopCallback}
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
                  handleGlobalComment(body, severity ?? 'suggestion');
                }}
                onCancel={() => onToggleGlobalCommentForm?.()}
              />
            </div>
          )}
        </div>
      )}

      {parsedFiles.map((file, index) => (
        <div key={file.path}>
          {(() => {
            if (!fileToGroup) return;
            const group = fileToGroup.get(file.path);
            const previousFile = parsedFiles[index - 1] as
              | FileDiffData
              | undefined;
            const previousGroup = previousFile
              ? fileToGroup.get(previousFile.path)
              : undefined;
            const isNewGroup = group && previousGroup?.name !== group.name;
            const isUngrouped =
              !group &&
              (index === 0 ||
                (previousFile && fileToGroup.has(previousFile.path)));
            if (isNewGroup) {
              return (
                <div
                  className="px-4 py-3 mb-2 border-b"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor:
                      'var(--color-bg-secondary, var(--color-surface))',
                  }}
                >
                  <div
                    className="text-sm font-semibold"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {group.name}
                  </div>
                  {group.description && (
                    <div className="text-xs mt-0.5 opacity-60">
                      {group.description}
                    </div>
                  )}
                </div>
              );
            }
            if (isUngrouped) {
              return (
                <div
                  className="px-4 py-3 mb-2 border-b"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor:
                      'var(--color-bg-secondary, var(--color-surface))',
                  }}
                >
                  <div className="text-sm font-semibold opacity-60">
                    Other Changes
                  </div>
                </div>
              );
            }
            return;
          })()}
          <div
            ref={createFileReferenceCallback(file.path)}
            data-file-path={file.path}
            className="mb-6 border rounded overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="px-4 py-2 text-sm font-mono font-medium border-b sticky top-0 z-10 flex items-center justify-between gap-4"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <span className="truncate">{file.path}</span>
              <span className="shrink-0 flex gap-2 text-xs items-center">
                {onAddComment && (
                  <button
                    onClick={() => {
                      setFileCommentFormPath(
                        fileCommentFormPath === file.path
                          ? undefined
                          : file.path,
                      );
                    }}
                    className="px-2 py-0.5 rounded border hover:opacity-80"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-accent)',
                    }}
                    title="Comment on file"
                  >
                    Comment
                  </button>
                )}
                {file.additions > 0 && (
                  <span style={{ color: 'var(--color-diff-add-line)' }}>
                    +{file.additions}
                  </span>
                )}
                {file.deletions > 0 && (
                  <span style={{ color: 'var(--color-diff-remove-line)' }}>
                    -{file.deletions}
                  </span>
                )}
              </span>
            </div>
            {visible.has(file.path) ? (
              <FileDiffComponent
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
                fileComments={fileCommentsByPath.get(`file:${file.path}`) ?? []}
                fileCommentFormOpen={fileCommentFormPath === file.path}
                onToggleFileCommentForm={() => {
                  setFileCommentFormPath(
                    fileCommentFormPath === file.path ? undefined : file.path,
                  );
                }}
                onCancelFileComment={() => {
                  setFileCommentFormPath(undefined);
                }}
                handleFileComment={handleFileComment}
                threadStatusMap={threadStatusMap}
                orphanedComments={orphanedByFile.get(file.path) ?? []}
              />
            ) : (
              <div
                className="font-mono text-sm px-4 py-3"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  opacity: 0.5,
                  height: measuredHeights[file.path]
                    ? measuredHeights[file.path] - 37
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
      {[...orphanedByFile.entries()]
        .filter(([filePath]) => !parsedFiles.some((f) => f.path === filePath))
        .map(([filePath, orphanedComments]) => (
          <div
            key={`orphaned-${filePath}`}
            className="mb-6 border rounded overflow-hidden"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="px-4 py-2 text-sm font-mono font-medium border-b"
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
              }}
            >
              <span className="truncate">{filePath}</span>
              <span className="ml-2 text-xs" style={{ opacity: 0.6 }}>
                (not in current diff)
              </span>
            </div>
            <div
              className="border-t"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div
                className="px-4 py-2 text-xs"
                style={{
                  opacity: 0.6,
                  backgroundColor: 'var(--color-bg-secondary)',
                }}
              >
                Comments on lines no longer in this diff
              </div>
              {orphanedComments.map((comment) => (
                <div key={comment.id} className="px-4 py-1">
                  {comment.startLine !== undefined && (
                    <div className="text-xs mb-1" style={{ opacity: 0.5 }}>
                      Line
                      {comment.startLine !== comment.endLine &&
                      comment.endLine !== undefined
                        ? `s ${String(comment.startLine)}–${String(comment.endLine)}`
                        : ` ${String(comment.startLine)}`}
                    </div>
                  )}
                  <CommentThread
                    comment={comment}
                    replies={repliesByParent.get(comment.id) ?? []}
                    onReply={onReplyComment ?? noopCallback}
                    onResolve={onResolveComment ?? noopCallback}
                    onEdit={onEditComment}
                    onDelete={onDeleteComment}
                    canEdit={canEditComments}
                    threadStatus={threadStatusMap?.get(comment.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
