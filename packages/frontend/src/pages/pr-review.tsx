import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileTree } from '../components/file-tree.js';
import { DiffViewer } from '../components/diff-viewer.js';
import { ReviewBar } from '../components/review-bar.js';
import { AgentStatusSection } from '../components/agent-status-section.js';
import { CommentFilter } from '../components/comment-filter.js';
import { InsightsTab } from '../components/insights-tab.js';
import {
  usePrData,
  formatAgentError,
  sortedByCycleNumber,
} from '../hooks/use-pr-data.js';
import type { ReviewCycle } from '../hooks/use-pr-data.js';

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

  const cyclesWithSnapshots = data.cycles.filter((c) => c.hasDiffSnapshot);
  const showCycleSelector = cyclesWithSnapshots.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* PR Header */}
      <div
        className="px-6 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Link
          to={`/projects/${data.pr.projectId}`}
          className="text-sm opacity-70 hover:opacity-100"
        >
          &larr; Back
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{data.pr.title}</h2>
            {data.selectedCycle === 'current' && (
              <button
                onClick={() => {
                  data.setGlobalCommentForm(!data.globalCommentForm);
                }}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-accent)',
                }}
              >
                Comment on PR
              </button>
            )}
            {data.pr.status === 'open' && !data.agentWorking && (
              <button
                onClick={() => {
                  void data.handleClosePr();
                }}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                Close PR
              </button>
            )}
            {data.pr.status === 'closed' && (
              <button
                onClick={() => {
                  void data.handleReopenPr();
                }}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-accent)',
                }}
              >
                Reopen
              </button>
            )}
          </div>
          {showCycleSelector && (
            <div className="flex items-center gap-2">
              <label htmlFor="cycle-select" className="text-sm opacity-70">
                Viewing:
              </label>
              <select
                id="cycle-select"
                value={data.selectedCycle}
                onChange={(event) => {
                  data.handleCycleChange(event.target.value);
                }}
                disabled={data.diffLoading}
                className="text-sm px-2 py-1 rounded border"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="current">Latest (live)</option>
                {(() => {
                  const sortedSnapshots =
                    sortedByCycleNumber(cyclesWithSnapshots);
                  return sortedSnapshots.map((cycle) => (
                    <option key={cycle.id} value={String(cycle.cycleNumber)}>
                      Cycle {cycle.cycleNumber}
                      {cycle.status === 'approved' ? ' (approved)' : ''}
                      {cycle.status === 'changes_requested'
                        ? ' (changes requested)'
                        : ''}
                      {cycle.status === 'superseded' ? ' (superseded)' : ''}
                    </option>
                  ));
                })()}
                {cyclesWithSnapshots.length >= 2 && (
                  <>
                    <option disabled>───────────</option>
                    {(() => {
                      const sorted = sortedByCycleNumber(cyclesWithSnapshots);
                      const options: React.ReactNode[] = [];

                      for (const cycle of sorted.slice(1)) {
                        const previousCycle = sorted.find(
                          (c) => c.cycleNumber === cycle.cycleNumber - 1,
                        );
                        if (!previousCycle) continue;
                        options.push(
                          <option
                            key={`inter-${String(previousCycle.cycleNumber)}-${String(cycle.cycleNumber)}`}
                            value={`inter:${String(previousCycle.cycleNumber)}:${String(cycle.cycleNumber)}`}
                          >
                            Changes: Cycle {previousCycle.cycleNumber} →{' '}
                            {cycle.cycleNumber}
                          </option>,
                        );
                      }

                      const reviewedCycles: ReviewCycle[] = sorted.filter(
                        (c) =>
                          c.status !== 'superseded' &&
                          c.status !== 'pending_review',
                      );
                      const latestCycleSorted: ReviewCycle | undefined =
                        sorted.at(-1);
                      if (reviewedCycles.length > 0 && latestCycleSorted) {
                        const lastReviewed: ReviewCycle | undefined =
                          reviewedCycles.at(-1);
                        if (
                          lastReviewed &&
                          lastReviewed.cycleNumber !==
                            latestCycleSorted.cycleNumber - 1
                        ) {
                          options.push(
                            <option
                              key={`reviewed-${String(lastReviewed.cycleNumber)}-${String(latestCycleSorted.cycleNumber)}`}
                              value={`inter:${String(lastReviewed.cycleNumber)}:${String(latestCycleSorted.cycleNumber)}`}
                            >
                              Changes: Since last review (Cycle{' '}
                              {lastReviewed.cycleNumber} →{' '}
                              {latestCycleSorted.cycleNumber})
                            </option>,
                          );
                        }
                      }

                      return options;
                    })()}
                  </>
                )}
              </select>
              {data.diffLoading && (
                <span className="text-sm opacity-50">Loading...</span>
              )}
              {data.diffError && (
                <span className="text-sm text-red-500">
                  Failed to load diff
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-sm opacity-70">
          <span
            className="inline-block px-2 py-0.5 rounded text-xs font-medium mr-2"
            style={{
              backgroundColor:
                data.pr.status === 'open'
                  ? 'rgba(46, 160, 67, 0.15)'
                  : 'rgba(130, 130, 130, 0.15)',
              color:
                data.pr.status === 'open'
                  ? 'var(--color-success)'
                  : 'var(--color-text)',
            }}
          >
            {data.pr.status}
          </span>
          {data.pr.sourceBranch} &rarr; {data.pr.baseBranch}
          {data.pr.workingDirectory && (
            <span
              className="ml-2 inline-block px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: 'rgba(130, 130, 130, 0.1)' }}
              title={data.pr.workingDirectory}
            >
              {data.pr.workingDirectory.split('/').slice(-2).join('/')}
            </span>
          )}
          {data.selectedCycle !== 'current' && (
            <span
              className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'rgba(130, 80, 223, 0.15)',
                color: 'var(--color-text)',
              }}
            >
              Snapshot from Cycle {data.selectedCycle}
            </span>
          )}
          {data.selectedCycleData?.context && (
            <span
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--color-text)',
              }}
            >
              Resubmit context:{' '}
              {data.selectedCycleData.context.length > 200
                ? data.selectedCycleData.context.slice(0, 200) + '...'
                : data.selectedCycleData.context}
            </span>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div
        className="flex border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          onClick={() => {
            data.setActiveTab('review');
          }}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 ${data.activeTab === 'review' ? 'border-b-2' : 'opacity-60'}`}
          style={
            data.activeTab === 'review'
              ? {
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent)',
                }
              : {}
          }
        >
          Review
          {data.agentWorking && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => {
            data.setActiveTab('insights');
          }}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 ${data.activeTab === 'insights' ? 'border-b-2' : 'opacity-60'}`}
          style={
            data.activeTab === 'insights'
              ? {
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent)',
                }
              : {}
          }
        >
          Insights
          {data.analyzerRunning && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </button>
      </div>

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
        <div
          className="px-6 py-3 border-t flex items-center justify-end"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          {data.analyzerRunning && (
            <button
              onClick={() => {
                void data.handleCancelAnalyzer();
              }}
              className="px-4 py-1.5 text-sm rounded font-medium border hover:opacity-80"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              Cancel Analyzer
            </button>
          )}
          {data.topLevelComments.length > 0 && !data.analyzerRunning && (
            <button
              onClick={() => {
                void data.handleRunAnalyzer();
              }}
              className="btn-danger px-4 py-1.5 text-sm rounded font-medium"
              style={{
                backgroundColor: 'var(--color-btn-danger-bg)',
                color: 'var(--color-btn-danger-fg)',
              }}
            >
              Run Analyzer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
