import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileTree } from '../components/file-tree.js';
import { DiffViewer } from '../components/diff-viewer.js';
import { ReviewBar } from '../components/review-bar.js';
import type { ActivityEntry } from '../components/agent-activity-panel.js';
import { AgentStatusSection } from '../components/agent-status-section.js';
import type { Comment } from '../components/comment-thread.js';
import type { FileStatus } from '../components/diff-viewer.js';
import { useWebSocket } from '../hooks/use-web-socket.js';
import { CommentFilter } from '../components/comment-filter.js';
import type { CommentFilterValue } from '../components/comment-filter.js';
import { InsightsTab } from '../components/insights-tab.js';
import {
  getThreadStatus,
  groupThreads,
} from '../utils/comment-thread-status.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: string;
  reviewedAt: string | undefined;
  agentCompletedAt: string | undefined;
  hasDiffSnapshot: boolean;
  context: string | undefined;
}

interface PrData {
  id: string;
  projectId: string;
  title: string;
  sourceBranch: string;
  baseBranch: string;
  status: string;
  workingDirectory?: string;
  agents?: Record<string, unknown>;
}

interface DiffData {
  diff: string;
  files: string[];
  fileGroups?: { name: string; description?: string; files: string[] }[];
}

interface WsMessageData {
  source?: string;
  prId?: string;
  entry?: ActivityEntry;
  error?: string;
}

function formatAgentError(detail: string | undefined): string {
  if (detail) return `Agent error: ${detail}`;
  return 'Agent error';
}

function sortedByCycleNumber(input: ReviewCycle[]): ReviewCycle[] {
  const copy = [...input];
  copy.sort((a, b) => a.cycleNumber - b.cycleNumber);
  return copy;
}

export function PRReview() {
  const { prId } = useParams<{ prId: string }>();
  const [pr, setPr] = useState<PrData | undefined>();
  const [diffData, setDiffData] = useState<DiffData | undefined>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [visibleFile, setVisibleFile] = useState<string | undefined>();
  const [scrollToFile, setScrollToFile] = useState<string | undefined>();
  const scrollKeyReference = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('current');
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | undefined>();
  const [globalCommentForm, setGlobalCommentForm] = useState(false);
  const [agentError, setAgentError] = useState<string | undefined>();
  const [agentActivity, setAgentActivity] = useState<ActivityEntry[]>([]);
  const [commentFilter, setCommentFilter] = useState<CommentFilterValue>('all');
  const [insights, setInsights] = useState<
    Record<string, unknown> | undefined
  >();
  const [insightsActivity, setInsightsActivity] = useState<ActivityEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'review' | 'insights'>('review');
  const [analyzerRunning, setAnalyzerRunning] = useState(false);
  const [fileGroups, setFileGroups] = useState<
    | {
        name: string;
        description?: string;
        files: string[];
      }[]
    | undefined
  >();
  const [viewMode, setViewMode] = useState<'directory' | 'logical'>(
    'directory',
  );

  const fetchComments = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.comments.list(prId);
      setComments(result as Comment[]);
    } catch {
      // Comments may not exist yet
    }
  }, [prId]);

  const fetchCycles = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.prs.cycles(prId);
      setCycles(result as ReviewCycle[]);
    } catch {
      // Cycles endpoint may fail
    }
  }, [prId]);

  const fetchInsights = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.insights.get(prId);
      setInsights(result as Record<string, unknown> | undefined);
    } catch {
      // Insights may not exist yet
    }
  }, [prId]);

  const handleWsAgentLifecycle = useCallback(
    (event: string, data: WsMessageData | undefined) => {
      setAgentError(undefined);
      if (event === 'agent:working') {
        if (data?.source === 'insights') {
          setInsightsActivity([]);
          setAnalyzerRunning(true);
        } else {
          setAgentActivity([]);
        }
      }
      if (
        (event === 'agent:completed' || event === 'agent:cancelled') &&
        data?.source === 'insights'
      ) {
        setAnalyzerRunning(false);
        void fetchInsights();
      }
      if (event === 'agent:completed' || event === 'agent:cancelled') {
        void fetchComments();
      }
      void fetchCycles();
    },
    [fetchComments, fetchCycles, fetchInsights],
  );

  useWebSocket((message) => {
    const data = message.data as WsMessageData | undefined;
    if (
      message.event === 'comment:added' ||
      message.event === 'comment:updated'
    ) {
      void fetchComments();
    }
    if (
      (message.event === 'review:submitted' ||
        message.event === 'pr:ready-for-review' ||
        message.event === 'pr:updated') &&
      prId
    ) {
      void api.prs.get(prId).then((result) => {
        setPr(result as PrData);
      });
      void fetchCycles();
    }
    if (
      message.event === 'agent:working' ||
      message.event === 'agent:completed' ||
      message.event === 'agent:cancelled'
    ) {
      handleWsAgentLifecycle(message.event, data);
    }
    if (
      message.event === 'agent:output' &&
      data?.prId === prId &&
      data?.entry
    ) {
      const entry = data.entry;
      if (data.source === 'insights') {
        setInsightsActivity((previous) => [...previous.slice(-49), entry]);
      } else {
        setAgentActivity((previous) => [...previous.slice(-49), entry]);
      }
    }
    if (message.event === 'agent:error') {
      if (data?.source === 'insights') {
        setAnalyzerRunning(false);
      }
      setAgentError(data?.error ?? 'Unknown error');
      void fetchCycles();
    }
  });

  const fetchDiff = useCallback(
    async (cycleValue: string) => {
      if (!prId) return;
      setDiffLoading(true);
      setDiffError(undefined);
      try {
        let diff: DiffData;
        if (cycleValue === 'current') {
          diff = (await api.prs.diff(prId)) as DiffData;
        } else if (cycleValue.startsWith('inter:')) {
          const [, fromString, toString_] = cycleValue.split(':');
          diff = (await api.prs.diff(prId, {
            from: Number.parseInt(fromString, 10),
            to: Number.parseInt(toString_, 10),
          })) as DiffData;
        } else {
          const cycleNumber = Number.parseInt(cycleValue, 10);
          diff = (await api.prs.diff(prId, { cycle: cycleNumber })) as DiffData;
        }
        setDiffData(diff);
        if (diff.fileGroups) {
          setFileGroups(diff.fileGroups);
          setViewMode('logical');
        } else {
          setFileGroups(undefined);
          setViewMode('directory');
        }
        setScrollToFile(undefined);
        setVisibleFile(undefined);
      } catch (error_) {
        setDiffError(
          error_ instanceof Error ? error_.message : 'Failed to load diff',
        );
      } finally {
        setDiffLoading(false);
      }
    },
    [prId],
  );

  useEffect(() => {
    if (!prId) return;
    void Promise.all([api.prs.get(prId), api.prs.diff(prId)])
      .then(([prResult, diffResult]) => {
        const prData = prResult as PrData;
        const diffResponse = diffResult as DiffData;
        setPr(prData);
        setDiffData(diffResponse);
        if (prData.agents?.insights) {
          setAnalyzerRunning(true);
        }
        if (diffResponse.fileGroups) {
          setFileGroups(diffResponse.fileGroups);
          setViewMode('logical');
        }
      })
      .catch((error_: unknown) => {
        setError(
          error_ instanceof Error ? error_.message : 'Failed to load PR',
        );
      })
      .finally(() => {
        setLoading(false);
      });

    void fetchComments();
    void fetchCycles();
    void fetchInsights();
  }, [prId, fetchComments, fetchCycles, fetchInsights]);

  const handleCycleChange = useCallback(
    (value: string) => {
      setSelectedCycle(value);
      void fetchDiff(value);
    },
    [fetchDiff],
  );

  const handleFileSelect = useCallback((file: string) => {
    scrollKeyReference.current++;
    setScrollToFile(file);
    setVisibleFile(file);
  }, []);

  const handleAddComment = async (data: {
    filePath: string | undefined;
    startLine: number | undefined;
    endLine: number | undefined;
    body: string;
    type: string;
  }) => {
    if (!prId) return;
    try {
      await api.comments.create(prId, {
        filePath: data.filePath,
        startLine: data.startLine,
        endLine: data.endLine,
        body: data.body,
        type: data.type,
        author: 'human',
      });
      await fetchComments();
    } catch (error_) {
      console.error('Failed to add comment:', error_);
      globalThis.alert('Failed to add comment. Check the console for details.');
    }
  };

  const handleReplyComment = async (commentId: string, body: string) => {
    if (!prId) return;
    try {
      const parent = comments.find((c) => c.id === commentId);
      await api.comments.create(prId, {
        filePath: parent?.filePath,
        startLine: parent?.startLine,
        endLine: parent?.endLine,
        body,
        type: 'suggestion',
        author: 'human',
        parentCommentId: commentId,
      });
      await fetchComments();
    } catch (error_) {
      console.error('Failed to reply:', error_);
      globalThis.alert('Failed to add reply. Check the console for details.');
    }
  };

  const handleResolveComment = async (commentId: string) => {
    try {
      await api.comments.update(commentId, { resolved: true });
      await fetchComments();
    } catch (error_) {
      console.error('Failed to resolve comment:', error_);
      globalThis.alert('Failed to resolve comment.');
    }
  };

  const handleEditComment = async (commentId: string, body: string) => {
    try {
      await api.comments.update(commentId, { body });
      await fetchComments();
    } catch (error_) {
      console.error('Failed to edit comment:', error_);
      globalThis.alert('Failed to edit comment.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.comments.delete(commentId);
      await fetchComments();
    } catch (error_) {
      console.error('Failed to delete comment:', error_);
      globalThis.alert('Failed to delete comment.');
    }
  };

  const handleReview = async (action: 'approve' | 'request-changes') => {
    if (!prId) return;
    await api.prs.review(prId, action);
    const updatedPr = await api.prs.get(prId);
    setPr(updatedPr as PrData);
    await fetchCycles();
  };

  const handleCancelAgent = async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId);
      await fetchCycles();
    } catch (error_) {
      console.error('Failed to cancel agent:', error_);
    }
  };

  const handleRunAnalyzer = async () => {
    if (!prId) return;
    try {
      await api.insights.runAnalyzer(prId);
    } catch (error_) {
      console.error('Failed to start insights analyzer:', error_);
    }
  };

  const handleCancelAnalyzer = async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId, 'insights');
    } catch (error_) {
      console.error('Failed to cancel analyzer:', error_);
    }
  };

  const handleClosePr = async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.close(prId);
      setPr(updated as PrData);
    } catch (error_) {
      console.error('Failed to close PR:', error_);
      globalThis.alert('Failed to close PR.');
    }
  };

  const handleReopenPr = async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.reopen(prId);
      setPr(updated as PrData);
    } catch (error_) {
      console.error('Failed to reopen PR:', error_);
      globalThis.alert('Failed to reopen PR.');
    }
  };

  const fileStatuses = useMemo(() => {
    if (!diffData) return {};
    const statuses: Record<string, FileStatus> = {};
    if (typeof diffData.diff !== 'string') return {};
    const lines = diffData.diff.split('\n');
    let fromNull = false;
    let minusPath = '';
    for (const line of lines) {
      if (line.startsWith('--- /dev/null')) {
        fromNull = true;
      } else if (line.startsWith('--- a/')) {
        fromNull = false;
        minusPath = line.slice(6);
      } else if (line.startsWith('+++ /dev/null')) {
        statuses[minusPath] = 'removed';
      } else if (line.startsWith('+++ b/')) {
        const path = line.slice(6);
        statuses[path] = fromNull ? 'added' : 'modified';
      }
    }
    return statuses;
  }, [diffData]);

  const latestCycle = useMemo(() => {
    if (cycles.length === 0) return;
    let latest = cycles[0];
    for (const c of cycles) {
      if (c.cycleNumber > latest.cycleNumber) {
        latest = c;
      }
    }
    return latest;
  }, [cycles]);

  const threadStatusMap = useMemo(() => {
    const map = new Map<string, ThreadStatus>();
    if (!latestCycle) return map;
    const threads = groupThreads(comments);
    for (const thread of threads) {
      const status = getThreadStatus(
        thread.comment,
        thread.replies,
        latestCycle.id,
      );
      map.set(thread.comment.id, status);
    }
    return map;
  }, [comments, latestCycle]);

  const selectedCycleData = useMemo(() => {
    if (selectedCycle === 'current') return;
    if (selectedCycle.startsWith('inter:')) return;
    const number_ = Number.parseInt(selectedCycle, 10);
    return cycles.find((c) => c.cycleNumber === number_);
  }, [selectedCycle, cycles]);

  const filterCounts = useMemo(() => {
    let all = 0;
    let needsAttention = 0;
    let agentReplied = 0;
    for (const [, status] of threadStatusMap) {
      all++;
      if (status === 'needs-attention' || status === 'new') needsAttention++;
      if (status === 'agent-replied') agentReplied++;
    }
    return { all, needsAttention, agentReplied };
  }, [threadStatusMap]);

  const filteredComments = useMemo(() => {
    if (commentFilter === 'all') return comments;
    return comments.filter((c) => {
      const parentId = c.parentCommentId ?? c.id;
      const status = threadStatusMap.get(parentId);
      if (!status) return true;
      if (commentFilter === 'needs-attention') {
        return status === 'needs-attention' || status === 'new';
      }
      return status === 'agent-replied';
    });
  }, [comments, commentFilter, threadStatusMap]);

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredComments) {
      if (c.filePath) {
        counts[c.filePath] = (counts[c.filePath] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredComments]);

  const agentWorking = latestCycle?.status === 'agent_working';
  const agentErrored = latestCycle?.status === 'agent_error';

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;
  if (!pr || !diffData) return <div className="p-6">PR not found</div>;

  const topLevelComments = comments.filter((c) => !c.parentCommentId);
  const cyclesWithSnapshots = cycles.filter((c) => c.hasDiffSnapshot);
  const showCycleSelector = cyclesWithSnapshots.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* PR Header */}
      <div
        className="px-6 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Link
          to={`/projects/${pr.projectId}`}
          className="text-sm opacity-70 hover:opacity-100"
        >
          &larr; Back
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{pr.title}</h2>
            {selectedCycle === 'current' && (
              <button
                onClick={() => {
                  setGlobalCommentForm(!globalCommentForm);
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
            {pr.status === 'open' && !agentWorking && (
              <button
                onClick={() => {
                  void handleClosePr();
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
            {pr.status === 'closed' && (
              <button
                onClick={() => {
                  void handleReopenPr();
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
                value={selectedCycle}
                onChange={(event) => {
                  handleCycleChange(event.target.value);
                }}
                disabled={diffLoading}
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
              {diffLoading && (
                <span className="text-sm opacity-50">Loading...</span>
              )}
              {diffError && (
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
                pr.status === 'open'
                  ? 'rgba(46, 160, 67, 0.15)'
                  : 'rgba(130, 130, 130, 0.15)',
              color:
                pr.status === 'open'
                  ? 'var(--color-success)'
                  : 'var(--color-text)',
            }}
          >
            {pr.status}
          </span>
          {pr.sourceBranch} &rarr; {pr.baseBranch}
          {pr.workingDirectory && (
            <span
              className="ml-2 inline-block px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: 'rgba(130, 130, 130, 0.1)' }}
              title={pr.workingDirectory}
            >
              {pr.workingDirectory.split('/').slice(-2).join('/')}
            </span>
          )}
          {selectedCycle !== 'current' && (
            <span
              className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'rgba(130, 80, 223, 0.15)',
                color: 'var(--color-text)',
              }}
            >
              Snapshot from Cycle {selectedCycle}
            </span>
          )}
          {selectedCycleData?.context && (
            <span
              className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--color-text)',
              }}
            >
              Resubmit context:{' '}
              {selectedCycleData.context.length > 200
                ? selectedCycleData.context.slice(0, 200) + '...'
                : selectedCycleData.context}
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
            setActiveTab('review');
          }}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'review' ? 'border-b-2' : 'opacity-60'}`}
          style={
            activeTab === 'review'
              ? {
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent)',
                }
              : {}
          }
        >
          Review
          {agentWorking && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab('insights');
          }}
          className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'insights' ? 'border-b-2' : 'opacity-60'}`}
          style={
            activeTab === 'insights'
              ? {
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent)',
                }
              : {}
          }
        >
          Insights
          {analyzerRunning && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          )}
        </button>
      </div>

      {/* Main content area */}
      {activeTab === 'review' ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <AgentStatusSection
            active={agentWorking}
            activity={agentActivity}
            onCancel={() => {
              void handleCancelAgent();
            }}
            error={agentErrored ? formatAgentError(agentError) : undefined}
          />
          {cycles.length > 1 && (
            <div className="px-4 shrink-0">
              <CommentFilter
                activeFilter={commentFilter}
                onFilterChange={setCommentFilter}
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
                  onSelectFile={handleFileSelect}
                  fileStatuses={fileStatuses}
                  commentCounts={commentCounts}
                  fileGroups={fileGroups}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
                <DiffViewer
                  diff={diffData.diff}
                  files={diffData.files}
                  scrollToFile={scrollToFile}
                  scrollKey={scrollKeyReference.current}
                  onVisibleFileChange={setVisibleFile}
                  comments={filteredComments}
                  threadStatusMap={threadStatusMap}
                  onAddComment={(data) => {
                    void handleAddComment(data);
                  }}
                  onReplyComment={(commentId, body) => {
                    void handleReplyComment(commentId, body);
                  }}
                  onResolveComment={(commentId) => {
                    void handleResolveComment(commentId);
                  }}
                  onEditComment={(commentId, body) => {
                    void handleEditComment(commentId, body);
                  }}
                  onDeleteComment={(commentId) => {
                    void handleDeleteComment(commentId);
                  }}
                  canEditComments={selectedCycle === 'current'}
                  globalCommentForm={globalCommentForm}
                  onToggleGlobalCommentForm={() => {
                    setGlobalCommentForm(!globalCommentForm);
                  }}
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
      ) : (
        <div className="flex-1 overflow-auto">
          <InsightsTab
            insights={insights as Parameters<typeof InsightsTab>[0]['insights']}
            hasComments={topLevelComments.length > 0}
            analyzerRunning={analyzerRunning}
            analyzerActivity={insightsActivity}
            onCancelAnalyzer={() => {
              void handleCancelAnalyzer();
            }}
          />
        </div>
      )}

      {/* Bottom bar */}
      {activeTab === 'review' ? (
        <ReviewBar
          prStatus={pr.status}
          commentCount={comments.length}
          agentWorking={agentWorking}
          onReview={(action) => {
            void handleReview(action);
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
          {analyzerRunning && (
            <button
              onClick={() => {
                void handleCancelAnalyzer();
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
          {topLevelComments.length > 0 && !analyzerRunning && (
            <button
              onClick={() => {
                void handleRunAnalyzer();
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
