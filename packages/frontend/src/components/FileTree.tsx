import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { FileIcon, FolderIcon } from '@react-symbols/icons/utils';
import {
  buildFileTree,
  buildGroupedFileTree,
  type TreeNode,
  type GroupTreeNode,
} from './fileTreeUtils';
import type { FileStatus } from './DiffViewer.js';

interface FileTreeProps {
  files: string[];
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  commentCounts?: Record<string, number>;
  fileGroups?: Array<{
    name: string;
    description?: string;
    files: string[];
  }> | null;
  viewMode?: 'directory' | 'logical';
  onViewModeChange?: (mode: 'directory' | 'logical') => void;
}

const STATUS_BADGE: Record<FileStatus, { label: string; color: string }> = {
  added: { label: 'A', color: 'var(--color-success)' },
  removed: { label: 'D', color: 'var(--color-danger)' },
  modified: { label: 'M', color: 'var(--color-warning)' },
};

function TreeNodeList({
  nodes,
  depth,
  collapsed,
  toggleDir,
  selectedFile,
  onSelectFile,
  fileStatuses,
  commentCounts,
}: {
  nodes: TreeNode[];
  depth: number;
  collapsed: Set<string>;
  toggleDir: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  commentCounts?: Record<string, number>;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'directory') {
          const isCollapsed = collapsed.has(node.path);
          return (
            <li key={node.path}>
              <button
                onClick={() => toggleDir(node.path)}
                className="file-tree-item w-full text-left flex items-center gap-1.5 py-1 pr-3 text-sm whitespace-nowrap opacity-70"
                style={{ paddingLeft: depth * 16 + 8 }}
              >
                <svg
                  className="w-3 h-3 shrink-0 transition-transform"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : '' }}
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
                <FolderIcon
                  folderName={node.name.split('/').pop()!}
                  className="w-4 h-4 shrink-0"
                />
                <span className="whitespace-nowrap">{node.name}</span>
              </button>
              {!isCollapsed && node.children && (
                <ul>
                  <TreeNodeList
                    nodes={node.children}
                    depth={depth + 1}
                    collapsed={collapsed}
                    toggleDir={toggleDir}
                    selectedFile={selectedFile}
                    onSelectFile={onSelectFile}
                    fileStatuses={fileStatuses}
                    commentCounts={commentCounts}
                  />
                </ul>
              )}
            </li>
          );
        }

        const badge = fileStatuses?.[node.path]
          ? STATUS_BADGE[fileStatuses[node.path]]
          : null;
        const count = commentCounts?.[node.path] ?? 0;
        return (
          <li key={node.path}>
            <button
              data-file-path={node.path}
              onClick={() => onSelectFile(node.path)}
              className={`file-tree-item w-full text-left flex items-center gap-1.5 py-1 pr-3 text-sm whitespace-nowrap ${
                selectedFile === node.path ? 'font-medium' : ''
              }`}
              style={{
                paddingLeft: depth * 16 + 28,
                ...(selectedFile === node.path
                  ? {
                      backgroundColor: 'var(--color-list-active-bg)',
                      color: 'var(--color-list-active-fg)',
                    }
                  : {}),
              }}
            >
              <FileIcon
                fileName={node.name}
                autoAssign
                className="w-4 h-4 shrink-0"
              />
              <span className="whitespace-nowrap flex-1">{node.name}</span>
              {count > 0 && (
                <span
                  className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {count}
                </span>
              )}
              {badge && (
                <span
                  className="text-xs font-bold shrink-0"
                  style={{ color: badge.color }}
                >
                  {badge.label}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </>
  );
}

function GroupedTreeNodeList({
  nodes,
  depth,
  collapsed,
  toggleDir,
  selectedFile,
  onSelectFile,
  fileStatuses,
  commentCounts,
}: {
  nodes: GroupTreeNode[];
  depth: number;
  collapsed: Set<string>;
  toggleDir: (path: string) => void;
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  commentCounts?: Record<string, number>;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === 'group') {
          const isCollapsed = collapsed.has(node.path);
          return (
            <li key={node.path}>
              <button
                onClick={() => toggleDir(node.path)}
                className="file-tree-item w-full text-left flex items-center gap-1.5 py-1.5 pr-3 text-sm font-medium"
                style={{ paddingLeft: depth * 16 + 8 }}
              >
                <svg
                  className="w-3 h-3 shrink-0 transition-transform"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : '' }}
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
                <span>{node.name}</span>
              </button>
              {!isCollapsed && (
                <>
                  {node.children && (
                    <ul>
                      {node.children.map((child) => {
                        const badge = fileStatuses?.[child.path]
                          ? STATUS_BADGE[fileStatuses[child.path]]
                          : null;
                        const count = commentCounts?.[child.path] ?? 0;
                        return (
                          <li key={child.path}>
                            <button
                              data-file-path={child.path}
                              onClick={() => onSelectFile(child.path)}
                              className={`file-tree-item w-full text-left flex items-center gap-1.5 py-1 pr-3 text-sm whitespace-nowrap ${
                                selectedFile === child.path ? 'font-medium' : ''
                              }`}
                              style={{
                                paddingLeft: (depth + 1) * 16 + 28,
                                ...(selectedFile === child.path
                                  ? {
                                      backgroundColor:
                                        'var(--color-list-active-bg)',
                                      color: 'var(--color-list-active-fg)',
                                    }
                                  : {}),
                              }}
                            >
                              <FileIcon
                                fileName={
                                  child.path.split('/').pop() || child.path
                                }
                                autoAssign
                                className="w-4 h-4 shrink-0"
                              />
                              <span className="whitespace-nowrap flex-1">
                                {child.path}
                              </span>
                              {count > 0 && (
                                <span
                                  className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                                  style={{
                                    backgroundColor:
                                      'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                                    color: 'var(--color-accent)',
                                  }}
                                >
                                  {count}
                                </span>
                              )}
                              {badge && (
                                <span
                                  className="text-xs font-bold shrink-0"
                                  style={{ color: badge.color }}
                                >
                                  {badge.label}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </li>
          );
        }

        // File nodes at the top level (shouldn't happen in grouped view, but handle for safety)
        const badge = fileStatuses?.[node.path]
          ? STATUS_BADGE[fileStatuses[node.path]]
          : null;
        const count = commentCounts?.[node.path] ?? 0;
        return (
          <li key={node.path}>
            <button
              data-file-path={node.path}
              onClick={() => onSelectFile(node.path)}
              className={`file-tree-item w-full text-left flex items-center gap-1.5 py-1 pr-3 text-sm whitespace-nowrap ${
                selectedFile === node.path ? 'font-medium' : ''
              }`}
              style={{
                paddingLeft: depth * 16 + 28,
                ...(selectedFile === node.path
                  ? {
                      backgroundColor: 'var(--color-list-active-bg)',
                      color: 'var(--color-list-active-fg)',
                    }
                  : {}),
              }}
            >
              <FileIcon
                fileName={node.path.split('/').pop() || node.path}
                autoAssign
                className="w-4 h-4 shrink-0"
              />
              <span className="whitespace-nowrap flex-1">{node.path}</span>
              {count > 0 && (
                <span
                  className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                    color: 'var(--color-accent)',
                  }}
                >
                  {count}
                </span>
              )}
              {badge && (
                <span
                  className="text-xs font-bold shrink-0"
                  style={{ color: badge.color }}
                >
                  {badge.label}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </>
  );
}

const MIN_WIDTH = 120;
const MAX_WIDTH = 600;

export function FileTree({
  files,
  selectedFile,
  onSelectFile,
  fileStatuses,
  commentCounts,
  fileGroups,
  viewMode,
  onViewModeChange,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(256);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);
  const groupedTree = useMemo(
    () => (fileGroups ? buildGroupedFileTree(fileGroups, files) : null),
    [fileGroups, files],
  );

  const toggleDir = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!selectedFile || !scrollRef.current) return;
    const btn = scrollRef.current.querySelector<HTMLElement>(
      `[data-file-path="${CSS.escape(selectedFile)}"]`,
    );
    btn?.scrollIntoView({ block: 'nearest' });
  }, [selectedFile]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      document.body.classList.add('select-none');

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX);
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
      };

      const handleMouseUp = () => {
        document.body.classList.remove('select-none');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width],
  );

  return (
    <div ref={containerRef} className="flex shrink-0" style={{ width }}>
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="flex items-center justify-between px-3 py-2 text-sm font-medium border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span>Files ({files.length})</span>
          {fileGroups && onViewModeChange && (
            <div className="flex gap-0.5">
              <button
                className={`px-1.5 py-0.5 text-xs rounded ${
                  viewMode === 'logical'
                    ? 'font-medium'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={
                  viewMode === 'logical'
                    ? {
                        backgroundColor: 'var(--color-list-active-bg)',
                        color: 'var(--color-list-active-fg)',
                      }
                    : {}
                }
                onClick={() => onViewModeChange('logical')}
              >
                Logical
              </button>
              <button
                className={`px-1.5 py-0.5 text-xs rounded ${
                  viewMode === 'directory'
                    ? 'font-medium'
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={
                  viewMode === 'directory'
                    ? {
                        backgroundColor: 'var(--color-list-active-bg)',
                        color: 'var(--color-list-active-fg)',
                      }
                    : {}
                }
                onClick={() => onViewModeChange('directory')}
              >
                Directory
              </button>
            </div>
          )}
        </div>
        <div ref={scrollRef} className="overflow-auto flex-1">
          <ul className="flex flex-col w-max min-w-full">
            {viewMode === 'logical' && groupedTree ? (
              <GroupedTreeNodeList
                nodes={groupedTree}
                depth={0}
                collapsed={collapsed}
                toggleDir={toggleDir}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                fileStatuses={fileStatuses}
                commentCounts={commentCounts}
              />
            ) : (
              <TreeNodeList
                nodes={tree}
                depth={0}
                collapsed={collapsed}
                toggleDir={toggleDir}
                selectedFile={selectedFile}
                onSelectFile={onSelectFile}
                fileStatuses={fileStatuses}
                commentCounts={commentCounts}
              />
            )}
          </ul>
        </div>
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="w-1.5 cursor-col-resize transition-colors"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-accent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-border)';
        }}
        style={{ backgroundColor: 'var(--color-border)' }}
      />
    </div>
  );
}
