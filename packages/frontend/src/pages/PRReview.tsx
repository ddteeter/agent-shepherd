import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileTree } from '../components/FileTree.js';
import { DiffViewer } from '../components/DiffViewer.js';
import { ReviewBar } from '../components/ReviewBar.js';
import { AgentActivityPanel } from '../components/AgentActivityPanel.js';
import type { ActivityEntry } from '../components/AgentActivityPanel.js';
import type { Comment } from '../components/CommentThread.js';
import type { FileStatus } from '../components/DiffViewer.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { CommentFilter } from '../components/CommentFilter.js';
import type { CommentFilterValue } from '../components/CommentFilter.js';
import { getThreadStatus, groupThreads } from '../utils/commentThreadStatus.js';
import type { ThreadStatus } from '../utils/commentThreadStatus.js';

interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: string;
  reviewedAt: string | null;
  agentCompletedAt: string | null;
  hasDiffSnapshot: boolean;
}

export function PRReview() {
  const { prId } = useParams<{ prId: string }>();
  const [pr, setPr] = useState<any>(null);
  const [diffData, setDiffData] = useState<{ diff: string; files: string[] } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [visibleFile, setVisibleFile] = useState<string | null>(null);
  const [scrollToFile, setScrollToFile] = useState<string | null>(null);
  const scrollKeyRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('current');
  const [diffLoading, setDiffLoading] = useState(false);
  const [globalCommentForm, setGlobalCommentForm] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentActivity, setAgentActivity] = useState<ActivityEntry[]>([]);
  const [commentFilter, setCommentFilter] = useState<CommentFilterValue>('all');

  const { connected } = useWebSocket((msg) => {
    if (msg.event === 'comment:added' || msg.event === 'comment:updated') {
      fetchComments();
    }
    if (msg.event === 'review:submitted' || msg.event === 'pr:ready-for-review' || msg.event === 'pr:updated') {
      if (prId) {
        api.prs.get(prId).then(setPr);
        fetchCycles();
      }
    }
    if (msg.event === 'agent:working' || msg.event === 'agent:completed' || msg.event === 'agent:cancelled') {
      setAgentError(null);
      if (msg.event === 'agent:working') {
        setAgentActivity([]);
      }
      fetchCycles();
    }
    if (msg.event === 'agent:output' && msg.data?.prId === prId && msg.data?.entry) {
      setAgentActivity((prev) => [...prev.slice(-49), msg.data.entry]);
    }
    if (msg.event === 'agent:error') {
      setAgentError(msg.data?.error || 'Unknown error');
      fetchCycles();
    }
  });

  const fetchComments = useCallback(async () => {
    if (!prId) return;
    try {
      const data = await api.comments.list(prId);
      setComments(data as Comment[]);
    } catch {
      // Comments may not exist yet, ignore errors
    }
  }, [prId]);

  const fetchCycles = useCallback(async () => {
    if (!prId) return;
    try {
      const data = await api.prs.cycles(prId);
      setCycles(data as ReviewCycle[]);
    } catch {
      // Cycles endpoint may fail, ignore
    }
  }, [prId]);

  const fetchDiff = useCallback(async (cycleValue: string) => {
    if (!prId) return;
    setDiffLoading(true);
    try {
      let diff;
      if (cycleValue === 'current') {
        diff = await api.prs.diff(prId);
      } else if (cycleValue.startsWith('inter:')) {
        const [, fromStr, toStr] = cycleValue.split(':');
        diff = await api.prs.diff(prId, { from: parseInt(fromStr, 10), to: parseInt(toStr, 10) });
      } else {
        const cycleNum = parseInt(cycleValue, 10);
        diff = await api.prs.diff(prId, { cycle: cycleNum });
      }
      setDiffData(diff);
      setScrollToFile(null);
      setVisibleFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diff');
    } finally {
      setDiffLoading(false);
    }
  }, [prId]);

  useEffect(() => {
    if (!prId) return;
    Promise.all([
      api.prs.get(prId),
      api.prs.diff(prId),
    ]).then(([prData, diff]) => {
      setPr(prData);
      setDiffData(diff);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load PR');
    }).finally(() => setLoading(false));

    fetchComments();
    fetchCycles();
  }, [prId, fetchComments, fetchCycles]);

  const handleCycleChange = useCallback((value: string) => {
    setSelectedCycle(value);
    fetchDiff(value);
  }, [fetchDiff]);

  const handleFileSelect = useCallback((file: string) => {
    scrollKeyRef.current++;
    setScrollToFile(file);
    setVisibleFile(file);
  }, []);

  const handleAddComment = async (data: { filePath: string | null; startLine: number | null; endLine: number | null; body: string; severity: string }) => {
    if (!prId) return;
    try {
      await api.comments.create(prId, {
        filePath: data.filePath,
        startLine: data.startLine,
        endLine: data.endLine,
        body: data.body,
        severity: data.severity,
        author: 'human',
      });
      await fetchComments();
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('Failed to add comment. Check the console for details.');
    }
  };

  const handleReplyComment = async (commentId: string, body: string) => {
    if (!prId) return;
    try {
      const parent = comments.find((c) => c.id === commentId);
      await api.comments.create(prId, {
        filePath: parent?.filePath ?? null,
        startLine: parent?.startLine ?? null,
        endLine: parent?.endLine ?? null,
        body,
        severity: 'suggestion',
        author: 'human',
        parentCommentId: commentId,
      });
      await fetchComments();
    } catch (err) {
      console.error('Failed to reply:', err);
      alert('Failed to add reply. Check the console for details.');
    }
  };

  const handleResolveComment = async (commentId: string) => {
    try {
      await api.comments.update(commentId, { resolved: true });
      await fetchComments();
    } catch (err) {
      console.error('Failed to resolve comment:', err);
      alert('Failed to resolve comment.');
    }
  };

  const handleEditComment = async (commentId: string, body: string) => {
    try {
      await api.comments.update(commentId, { body });
      await fetchComments();
    } catch (err) {
      console.error('Failed to edit comment:', err);
      alert('Failed to edit comment.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.comments.delete(commentId);
      await fetchComments();
    } catch (err) {
      console.error('Failed to delete comment:', err);
      alert('Failed to delete comment.');
    }
  };

  const handleReview = async (action: 'approve' | 'request-changes') => {
    if (!prId) return;
    await api.prs.review(prId, action);
    const updatedPr = await api.prs.get(prId);
    setPr(updatedPr);
    await fetchCycles();
  };

  const handleCancelAgent = async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId);
      await fetchCycles();
    } catch (err) {
      console.error('Failed to cancel agent:', err);
    }
  };

  const handleClosePr = async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.close(prId);
      setPr(updated);
    } catch (err) {
      console.error('Failed to close PR:', err);
      alert('Failed to close PR.');
    }
  };

  const handleReopenPr = async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.reopen(prId);
      setPr(updated);
    } catch (err) {
      console.error('Failed to reopen PR:', err);
      alert('Failed to reopen PR.');
    }
  };

  const fileStatuses = useMemo(() => {
    if (!diffData) return {};
    const statuses: Record<string, FileStatus> = {};
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
    if (cycles.length === 0) return null;
    return cycles.reduce((latest, c) => c.cycleNumber > latest.cycleNumber ? c : latest, cycles[0]);
  }, [cycles]);

  const threadStatusMap = useMemo(() => {
    const map = new Map<string, ThreadStatus>();
    if (!latestCycle) return map;
    const threads = groupThreads(comments);
    for (const thread of threads) {
      const status = getThreadStatus(thread.comment, thread.replies, latestCycle.id);
      map.set(thread.comment.id, status);
    }
    return map;
  }, [comments, latestCycle]);

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
      // For replies, include if parent passes filter
      const parentId = c.parentCommentId || c.id;
      const status = threadStatusMap.get(parentId);
      if (!status) return true; // replies whose parent we can't find — include
      if (commentFilter === 'needs-attention') {
        return status === 'needs-attention' || status === 'new';
      }
      if (commentFilter === 'agent-replied') {
        return status === 'agent-replied';
      }
      return true;
    });
  }, [comments, commentFilter, threadStatusMap]);

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredComments) {
      if (c.filePath) {
        counts[c.filePath] = (counts[c.filePath] || 0) + 1;
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
      <div className="px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <Link to={`/projects/${pr.projectId}`} className="text-sm opacity-70 hover:opacity-100">
          &larr; Back
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{pr.title}</h2>
            {selectedCycle === 'current' && (
              <button
                onClick={() => setGlobalCommentForm(!globalCommentForm)}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
              >
                Comment on PR
              </button>
            )}
            {pr.status === 'open' && !agentWorking && (
              <button
                onClick={handleClosePr}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                Close PR
              </button>
            )}
            {pr.status === 'closed' && (
              <button
                onClick={handleReopenPr}
                className="text-xs px-2 py-1 rounded border hover:opacity-80"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
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
                onChange={(e) => handleCycleChange(e.target.value)}
                disabled={diffLoading}
                className="text-sm px-2 py-1 rounded border"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                <option value="current">Current changes</option>
                {cyclesWithSnapshots
                  .sort((a, b) => a.cycleNumber - b.cycleNumber)
                  .map((cycle) => (
                    <option key={cycle.id} value={String(cycle.cycleNumber)}>
                      Cycle {cycle.cycleNumber}
                      {cycle.status === 'approved' ? ' (approved)' : ''}
                      {cycle.status === 'changes_requested' ? ' (changes requested)' : ''}
                    </option>
                  ))
                }
                {cyclesWithSnapshots.length >= 2 && (
                  <>
                    <option disabled>───────────</option>
                    {cyclesWithSnapshots
                      .sort((a, b) => a.cycleNumber - b.cycleNumber)
                      .slice(1)
                      .map((cycle) => {
                        const prevCycle = cyclesWithSnapshots.find(
                          (c) => c.cycleNumber === cycle.cycleNumber - 1
                        );
                        if (!prevCycle) return null;
                        return (
                          <option
                            key={`inter-${prevCycle.cycleNumber}-${cycle.cycleNumber}`}
                            value={`inter:${prevCycle.cycleNumber}:${cycle.cycleNumber}`}
                          >
                            Changes: Cycle {prevCycle.cycleNumber} → {cycle.cycleNumber}
                          </option>
                        );
                      })
                    }
                  </>
                )}
              </select>
              {diffLoading && (
                <span className="text-sm opacity-50">Loading...</span>
              )}
            </div>
          )}
        </div>
        <div className="text-sm opacity-70">
          <span
            className="inline-block px-2 py-0.5 rounded text-xs font-medium mr-2"
            style={{
              backgroundColor: pr.status === 'open' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(130, 130, 130, 0.15)',
              color: pr.status === 'open' ? 'var(--color-success)' : 'var(--color-text)',
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
        </div>
        {agentWorking && (
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span style={{ color: 'var(--color-warning, #d29922)' }}>Agent working...</span>
            <button
              onClick={handleCancelAgent}
              className="text-xs px-2 py-0.5 rounded border hover:opacity-80"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Cancel
            </button>
          </div>
        )}
        {agentErrored && (
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
            <span style={{ color: 'var(--color-danger, #cf222e)' }}>
              Agent error{agentError ? `: ${agentError}` : ''}
            </span>
          </div>
        )}
        {(agentWorking || agentActivity.length > 0) && (
          <AgentActivityPanel entries={agentActivity} />
        )}
        {cycles.length > 1 && (
          <CommentFilter
            activeFilter={commentFilter}
            onFilterChange={setCommentFilter}
            counts={filterCounts}
          />
        )}
      </div>

      {/* Main content area: file tree + diff viewer */}
      <div className="flex flex-1 overflow-hidden">
        <FileTree
          files={diffData.files}
          selectedFile={visibleFile}
          onSelectFile={handleFileSelect}
          fileStatuses={fileStatuses}
          commentCounts={commentCounts}
        />
        <DiffViewer
          diff={diffData.diff}
          files={diffData.files}
          scrollToFile={scrollToFile}
          scrollKey={scrollKeyRef.current}
          onVisibleFileChange={setVisibleFile}
          comments={filteredComments}
          threadStatusMap={threadStatusMap}
          onAddComment={handleAddComment}
          onReplyComment={handleReplyComment}
          onResolveComment={handleResolveComment}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          canEditComments={selectedCycle === 'current'}
          globalCommentForm={globalCommentForm}
          onToggleGlobalCommentForm={() => setGlobalCommentForm(!globalCommentForm)}
        />
      </div>

      {/* Review submission bar */}
      <ReviewBar
        prId={prId || ''}
        prStatus={pr.status}
        commentCount={comments.length}
        agentWorking={agentWorking}
        onReview={handleReview}
      />
    </div>
  );
}
