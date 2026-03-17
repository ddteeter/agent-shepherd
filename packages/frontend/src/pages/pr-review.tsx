import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { FileTree } from '../components/file-tree.js';
import { DiffViewer } from '../components/diff-viewer.js';
import { ReviewBar } from '../components/review-bar.js';
import { AgentStatusSection } from '../components/agent-status-section.js';
import { CommentFilter } from '../components/comment-filter.js';
import { InsightsTab } from '../components/insights-tab.js';
import { PRHeader } from '../components/pr-header.js';
import { PRTabBar } from '../components/pr-tab-bar.js';
import { InsightsFooter } from '../components/insights-footer.js';
import { usePrData, formatAgentError } from '../hooks/use-pr-data.js';

export function PRReview() {
  const { prId } = useParams<{ prId: string }>();

  const [visibleFile, setVisibleFile] = useState<string | undefined>();
  const [scrollToFile, setScrollToFile] = useState<string | undefined>();
  const [scrollKey, setScrollKey] = useState(0);

  const data = usePrData(prId, {
    onDiffLoaded: () => {
      setScrollToFile(undefined);
      setVisibleFile(undefined);
    },
  });

  const handleFileSelect = useCallback((file: string) => {
    setScrollKey((k) => k + 1);
    setScrollToFile(file);
    setVisibleFile(file);
  }, []);

  if (data.loading) return <div className="p-6">Loading...</div>;
  if (data.error)
    return <div className="p-6 text-red-500">Error: {data.error}</div>;
  if (!data.pr || !data.diffData)
    return <div className="p-6">PR not found</div>;

  return (
    <div className="flex flex-col h-full">
      <PRHeader
        pr={data.pr}
        selectedCycle={data.selectedCycle}
        selectedCycleData={data.selectedCycleData}
        cycles={data.cycles}
        diffLoading={data.diffLoading}
        diffError={data.diffError}
        agentWorking={data.agentWorking}
        onCycleChange={data.handleCycleChange}
        onToggleGlobalCommentForm={() => {
          data.setGlobalCommentForm(!data.globalCommentForm);
        }}
        onClosePr={() => {
          void data.handleClosePr();
        }}
        onReopenPr={() => {
          void data.handleReopenPr();
        }}
      />

      <PRTabBar
        activeTab={data.activeTab}
        onTabChange={data.setActiveTab}
        agentWorking={data.agentWorking}
        analyzerRunning={data.analyzerRunning}
      />

      {/* Main content area */}
      {data.activeTab === 'review' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <AgentStatusSection
            active={data.agentWorking}
            activity={data.agentActivity}
            onCancel={() => {
              void data.handleCancelAgent();
            }}
            error={
              data.agentErrored ? formatAgentError(data.agentError) : undefined
            }
          />
          {data.cycles.length > 1 && (
            <div className="px-4 shrink-0">
              <CommentFilter
                activeFilter={data.commentFilter}
                onFilterChange={data.setCommentFilter}
                counts={data.filterCounts}
              />
            </div>
          )}
          <div className="flex flex-1 overflow-hidden">
            {data.diffError && (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center">
                  <p className="text-sm opacity-70">
                    Failed to load diff for this cycle.
                  </p>
                  <p className="text-xs opacity-50 mt-1">{data.diffError}</p>
                </div>
              </div>
            )}
            {!data.diffError && typeof data.diffData.diff === 'string' && (
              <>
                <FileTree
                  files={data.diffData.files}
                  selectedFile={visibleFile}
                  onSelectFile={handleFileSelect}
                  fileStatuses={data.fileStatuses}
                  commentCounts={data.commentCounts}
                  fileGroups={data.fileGroups}
                  viewMode={data.viewMode}
                  onViewModeChange={data.setViewMode}
                />
                <DiffViewer
                  diff={data.diffData.diff}
                  files={data.diffData.files}
                  scrollToFile={scrollToFile}
                  scrollKey={scrollKey}
                  onVisibleFileChange={setVisibleFile}
                  comments={data.filteredComments}
                  threadStatusMap={data.threadStatusMap}
                  onAddComment={(commentData) => {
                    void data.handleAddComment(commentData);
                  }}
                  onReplyComment={(commentId, body) => {
                    void data.handleReplyComment(commentId, body);
                  }}
                  onResolveComment={(commentId) => {
                    void data.handleResolveComment(commentId);
                  }}
                  onEditComment={(commentId, body) => {
                    void data.handleEditComment(commentId, body);
                  }}
                  onDeleteComment={(commentId) => {
                    void data.handleDeleteComment(commentId);
                  }}
                  canEditComments={true}
                  globalCommentForm={data.globalCommentForm}
                  onToggleGlobalCommentForm={() => {
                    data.setGlobalCommentForm(!data.globalCommentForm);
                  }}
                  fileGroups={data.fileGroups}
                  viewMode={data.viewMode}
                />
              </>
            )}
            {!data.diffError && typeof data.diffData.diff !== 'string' && (
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
      ) : (
        <div className="flex-1 overflow-auto">
          <InsightsTab
            insights={
              data.insights as Parameters<typeof InsightsTab>[0]['insights']
            }
            hasComments={data.topLevelComments.length > 0}
            analyzerRunning={data.analyzerRunning}
            analyzerActivity={data.insightsActivity}
            onCancelAnalyzer={() => {
              void data.handleCancelAnalyzer();
            }}
          />
        </div>
      )}

      {/* Bottom bar */}
      {data.activeTab === 'review' ? (
        <ReviewBar
          prStatus={data.pr.status}
          commentCount={data.comments.length}
          agentWorking={data.agentWorking}
          onReview={(action) => {
            void data.handleReview(action);
          }}
        />
      ) : (
        <InsightsFooter
          analyzerRunning={data.analyzerRunning}
          hasComments={data.topLevelComments.length > 0}
          onRunAnalyzer={() => {
            void data.handleRunAnalyzer();
          }}
          onCancelAnalyzer={() => {
            void data.handleCancelAnalyzer();
          }}
        />
      )}
    </div>
  );
}
