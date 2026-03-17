import { useState, useMemo } from 'react';
import { CommentForm } from './comment-form.js';
import { CommentThread } from './comment-thread.js';
import type { Comment } from './comment-thread.js';
import {
  useHighlighter,
  getLangFromPath,
  type TokenizedLine,
} from '../hooks/use-highlighter.js';
import { useLineSelection } from '../hooks/use-line-selection.js';
import { useFileVisibility } from '../hooks/use-file-visibility.js';
import {
  getFileTreeOrder,
  getGroupedFileOrder,
} from './file-tree-utilities.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';
import { parseDiff, type FileDiffData } from '../utils/diff-parser.js';
import { categorizeComments } from '../utils/comment-categorizer.js';
import type { AddCommentData } from './diff-viewer-types.js';

export type {
  FileStatus,
  AddCommentData,
  CommentActions,
} from './diff-viewer-types.js';

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
  onAddComment?: (data: AddCommentData) => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onResolveComment?: (commentId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
  canEditComments?: boolean;
  globalCommentForm?: boolean;
  onToggleGlobalCommentForm?: () => void;
  fileGroups?: {
    name: string;
    description?: string;
    files: string[];
  }[];
  viewMode?: 'directory' | 'logical';
}

function HighlightedContent({
  content,
  tokens,
}: Readonly<{
  content: string;
  tokens: TokenizedLine | undefined;
}>) {
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

function borderLeftForLineType(type: string): string {
  if (type === 'add') return '3px solid var(--color-diff-add-line)';
  if (type === 'remove') return '3px solid var(--color-diff-remove-line)';
  return '3px solid transparent';
}

function colorForLineType(type: string): string {
  if (type === 'add') return 'var(--color-diff-add-line)';
  if (type === 'remove') return 'var(--color-diff-remove-line)';
  return 'transparent';
}

function symbolForLineType(type: string): string {
  if (type === 'add') return '+';
  if (type === 'remove') return '-';
  return ' ';
}

function sideForLineType(type: string): 'old' | 'new' {
  return type === 'remove' ? 'old' : 'new';
}

function backgroundForSelection(
  isSelected: boolean,
  isInRange: boolean,
): string | undefined {
  if (isSelected)
    return 'color-mix(in srgb, var(--color-accent) 15%, transparent)';
  if (isInRange)
    return 'color-mix(in srgb, var(--color-accent) 6%, transparent)';
  return undefined;
}

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
}: Readonly<{
  file: FileDiffData;
  commentsByFileLine: Map<string, Comment[]>;
  repliesByParent: Map<string, Comment[]>;
  commentFormLine:
    | { file: string; startLine: number; endLine: number; side: 'old' | 'new' }
    | undefined;
  dragSelection:
    | { file: string; startLine: number; endLine: number; side: 'old' | 'new' }
    | undefined;
  buttonsHidden: boolean;
  onLineClick: (
    filePath: string,
    lineNo: number,
    shiftKey: boolean,
    side: 'old' | 'new',
  ) => void;
  onDragStart: (filePath: string, lineNo: number, side: 'old' | 'new') => void;
  onDragOver: (filePath: string, lineNo: number, side: 'old' | 'new') => void;
  onFinalizeDrag: () => void;
  onCancelComment: () => void;
  onAddComment?: DiffViewerProperties['onAddComment'];
  handleAddComment: (
    filePath: string | undefined,
    startLine: number | undefined,
    endLine: number | undefined,
    body: string,
    type: string,
    side: 'old' | 'new' | undefined,
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
  handleFileComment: (filePath: string, body: string, type: string) => void;
  threadStatusMap?: Map<string, ThreadStatus>;
  orphanedComments: Comment[];
}>) {
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
                onSubmit={({ body, type }) => {
                  handleFileComment(file.path, body, type ?? 'suggestion');
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
                const side = sideForLineType(line.type);
                const lineNo =
                  side === 'old'
                    ? (line.oldLineNo ?? 0)
                    : (line.newLineNo ?? line.oldLineNo ?? 0);
                const lineKey = `${file.path}:${String(lineNo)}:${side}`;
                const activeRange = dragSelection ?? commentFormLine;
                const isInSelectedRange =
                  activeRange?.file === file.path &&
                  activeRange.side === side &&
                  lineNo >= activeRange.startLine &&
                  lineNo <= activeRange.endLine;
                const isFormOpenAfterThis =
                  commentFormLine?.file === file.path &&
                  commentFormLine.side === side &&
                  commentFormLine.endLine === lineNo;
                const isInCommentRange = commentRangeLines.has(lineKey);
                const lineComments = commentsByFileLine.get(lineKey) ?? [];
                const tokens = tokenizeLine(line.content, lang);

                return (
                  <div key={lineIndex}>
                    <div
                      className="diff-line px-4 py-0 flex relative cursor-pointer"
                      style={{
                        borderLeft: borderLeftForLineType(line.type),
                        backgroundColor: backgroundForSelection(
                          isInSelectedRange,
                          isInCommentRange,
                        ),
                      }}
                      onClick={
                        onAddComment
                          ? (event) => {
                              onLineClick(
                                file.path,
                                lineNo,
                                event.shiftKey,
                                side,
                              );
                            }
                          : undefined
                      }
                      onMouseDown={
                        onAddComment
                          ? (event) => {
                              if (!event.shiftKey) {
                                event.preventDefault();
                                onDragStart(file.path, lineNo, side);
                              }
                            }
                          : undefined
                      }
                      onMouseEnter={() => {
                        setHoveredLineKey(
                          `${String(hunkIndex)}:${String(lineIndex)}`,
                        );
                        onDragOver(file.path, lineNo, side);
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
                          color: colorForLineType(line.type),
                        }}
                      >
                        {symbolForLineType(line.type)}
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
                          onSubmit={({ body, type }) => {
                            handleAddComment(
                              file.path,
                              commentFormLine.startLine,
                              commentFormLine.endLine,
                              body,
                              type ?? 'suggestion',
                              commentFormLine.side,
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
}: Readonly<DiffViewerProperties>) {
  const {
    commentFormLine,
    dragSelection,
    buttonsHidden,
    setButtonsHidden,
    fileCommentFormPath,
    setFileCommentFormPath,
    handleLineClick,
    handleCancelComment,
    handleAddComment,
    handleFileComment,
    handleGlobalComment,
    handleDragStart,
    handleDragOver,
    finalizeDrag,
  } = useLineSelection({ onAddComment, onToggleGlobalCommentForm });

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

  const {
    visible,
    measuredHeights,
    containerRef: containerReference,
    createFileRefCallback: createFileReferenceCallback,
  } = useFileVisibility({
    parsedFiles,
    scrollToFile,
    scrollKey,
    onVisibleFileChange,
  });

  const {
    commentsByFileLine,
    fileCommentsByPath,
    globalComments,
    repliesByParent,
    commentRangeLines,
    orphanedByFile,
  } = useMemo(
    () => categorizeComments(comments, parsedFiles),
    [comments, parsedFiles],
  );

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
                onSubmit={({ body, type }) => {
                  handleGlobalComment(body, type ?? 'suggestion');
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
