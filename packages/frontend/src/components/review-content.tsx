import { FileTree } from './file-tree.js';
import { DiffViewer } from './diff-viewer.js';
import type { FileStatus, AddCommentData } from './diff-viewer.js';
import { AgentStatusSection } from './agent-status-section.js';
import type { ActivityEntry } from './agent-activity-panel.js';
import { CommentFilter } from './comment-filter.js';
import type { CommentFilterValue } from './comment-filter.js';
import type { Comment } from './comment-thread.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';
import type { ReviewCycle } from '../hooks/use-pr-data.js';

interface ReviewContentProperties {
  agentWorking: boolean;
  agentActivity: ActivityEntry[];
  agentError: string | undefined;
  onCancelAgent: () => void;
  cycles: ReviewCycle[];
  commentFilter: CommentFilterValue;
  onFilterChange: (filter: CommentFilterValue) => void;
  filterCounts: { all: number; needsAttention: number; agentReplied: number };
  diffError: string | undefined;
  diffData: { diff: string; files: string[] };
  fileStatuses: Record<string, FileStatus>;
  commentCounts: Record<string, number>;
  fileGroups:
    | { name: string; description?: string; files: string[] }[]
    | undefined;
  viewMode: 'directory' | 'logical';
  onViewModeChange: (mode: 'directory' | 'logical') => void;
  visibleFile: string | undefined;
  onSelectFile: (file: string) => void;
  scrollToFile: string | undefined;
  scrollKey: number;
  onVisibleFileChange: (file: string) => void;
  filteredComments: Comment[];
  threadStatusMap: Map<string, ThreadStatus>;
  onAddComment: (data: AddCommentData) => void;
  onReplyComment: (commentId: string, body: string) => void;
  onResolveComment: (commentId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  globalCommentForm: boolean;
  onToggleGlobalCommentForm: () => void;
}

export function ReviewContent({
  agentWorking,
  agentActivity,
  agentError,
  onCancelAgent,
  cycles,
  commentFilter,
  onFilterChange,
  filterCounts,
  diffError,
  diffData,
  fileStatuses,
  commentCounts,
  fileGroups,
  viewMode,
  onViewModeChange,
  visibleFile,
  onSelectFile,
  scrollToFile,
  scrollKey,
  onVisibleFileChange,
  filteredComments,
  threadStatusMap,
  onAddComment,
  onReplyComment,
  onResolveComment,
  onEditComment,
  onDeleteComment,
  globalCommentForm,
  onToggleGlobalCommentForm,
}: Readonly<ReviewContentProperties>) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <AgentStatusSection
        active={agentWorking}
        activity={agentActivity}
        onCancel={onCancelAgent}
        error={agentError}
      />
      {cycles.length > 1 && (
        <div className="px-4 shrink-0">
          <CommentFilter
            activeFilter={commentFilter}
            onFilterChange={onFilterChange}
            counts={filterCounts}
          />
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {diffError && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-sm opacity-70">
                Failed to load diff for this cycle.
              </p>
              <p className="text-xs opacity-50 mt-1">{diffError}</p>
            </div>
          </div>
        )}
        {!diffError && typeof diffData.diff === 'string' && (
          <>
            <FileTree
              files={diffData.files}
              selectedFile={visibleFile}
              onSelectFile={onSelectFile}
              fileStatuses={fileStatuses}
              commentCounts={commentCounts}
              fileGroups={fileGroups}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
            />
            <DiffViewer
              diff={diffData.diff}
              files={diffData.files}
              scrollToFile={scrollToFile}
              scrollKey={scrollKey}
              onVisibleFileChange={onVisibleFileChange}
              comments={filteredComments}
              threadStatusMap={threadStatusMap}
              onAddComment={onAddComment}
              onReplyComment={onReplyComment}
              onResolveComment={onResolveComment}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
              canEditComments={true}
              globalCommentForm={globalCommentForm}
              onToggleGlobalCommentForm={onToggleGlobalCommentForm}
              fileGroups={fileGroups}
              viewMode={viewMode}
            />
          </>
        )}
        {!diffError && typeof diffData.diff !== 'string' && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-sm opacity-70">
                Diff snapshot is unavailable for this cycle.
              </p>
              <p className="text-xs opacity-50 mt-1">
                This cycle was superseded before a diff snapshot could be
                captured, or the snapshot data was lost. Try viewing a more
                recent cycle instead.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
