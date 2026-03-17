import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ReviewBar } from '../components/review-bar.js';
import { InsightsTab } from '../components/insights-tab.js';
import { PRHeader } from '../components/pr-header.js';
import { PRTabBar } from '../components/pr-tab-bar.js';
import { InsightsFooter } from '../components/insights-footer.js';
import { ReviewContent } from '../components/review-content.js';
import type { CommentActions } from '../components/diff-viewer-types.js';
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

  const {
    handleAddComment,
    handleReplyComment,
    handleResolveComment,
    handleEditComment,
    handleDeleteComment,
  } = data;

  const commentActions: CommentActions = useMemo(
    () => ({
      onAdd: (commentData) => {
        void handleAddComment(commentData);
      },
      onReply: (commentId, body) => {
        void handleReplyComment(commentId, body);
      },
      onResolve: (commentId) => {
        void handleResolveComment(commentId);
      },
      onEdit: (commentId, body) => {
        void handleEditComment(commentId, body);
      },
      onDelete: (commentId) => {
        void handleDeleteComment(commentId);
      },
    }),
    [
      handleAddComment,
      handleReplyComment,
      handleResolveComment,
      handleEditComment,
      handleDeleteComment,
    ],
  );

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

      {data.activeTab === 'review' ? (
        <ReviewContent
          agentWorking={data.agentWorking}
          agentActivity={data.agentActivity}
          agentError={
            data.agentErrored ? formatAgentError(data.agentError) : undefined
          }
          onCancelAgent={() => {
            void data.handleCancelAgent();
          }}
          cycles={data.cycles}
          commentFilter={data.commentFilter}
          onFilterChange={data.setCommentFilter}
          filterCounts={data.filterCounts}
          diffError={data.diffError}
          diffData={data.diffData}
          fileStatuses={data.fileStatuses}
          commentCounts={data.commentCounts}
          fileGroups={data.fileGroups}
          viewMode={data.viewMode}
          onViewModeChange={data.setViewMode}
          visibleFile={visibleFile}
          onSelectFile={handleFileSelect}
          scrollToFile={scrollToFile}
          scrollKey={scrollKey}
          onVisibleFileChange={setVisibleFile}
          filteredComments={data.filteredComments}
          threadStatusMap={data.threadStatusMap}
          commentActions={commentActions}
          globalCommentForm={data.globalCommentForm}
          onToggleGlobalCommentForm={() => {
            data.setGlobalCommentForm(!data.globalCommentForm);
          }}
        />
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
