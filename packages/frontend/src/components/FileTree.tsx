import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { FileIcon, FolderIcon } from '@react-symbols/icons/utils';
import { buildFileTree, type TreeNode } from './fileTreeUtils';
import type { FileStatus } from './DiffViewer.js';

interface FileTreeProps {
  files: string[];
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
  fileStatuses?: Record<string, FileStatus>;
  commentCounts?: Record<string, number>;
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

        const badge = fileStatuses?.[node.path] ? STATUS_BADGE[fileStatuses[node.path]] : null;
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
                    backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
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

export function FileTree({ files, selectedFile, onSelectFile, fileStatuses, commentCounts }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(256);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildFileTree(files), [files]);

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
    <div
      ref={containerRef}
      className="flex shrink-0"
      style={{ width }}
    >
      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="p-3 text-sm font-medium border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Files ({files.length})
        </div>
        <div ref={scrollRef} className="overflow-auto flex-1">
          <ul className="flex flex-col w-max min-w-full">
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
          </ul>
        </div>
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="w-1.5 cursor-col-resize transition-colors"
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-border)'; }}
        style={{ backgroundColor: 'var(--color-border)' }}
      />
    </div>
  );
}
