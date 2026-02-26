import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileTree } from '../components/FileTree.js';
import { DiffViewer } from '../components/DiffViewer.js';
import { ReviewBar } from '../components/ReviewBar.js';
import type { Comment } from '../components/CommentThread.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('current');
  const [diffLoading, setDiffLoading] = useState(false);

  const { connected } = useWebSocket((msg) => {
    // Refresh comments on new comment
    if (msg.event === 'comment:added' || msg.event === 'comment:updated') {
      fetchComments();
    }
    // Refresh PR on status change
    if (msg.event === 'review:submitted' || msg.event === 'pr:ready-for-review' || msg.event === 'pr:updated') {
      if (prId) {
        api.prs.get(prId).then(setPr);
        fetchCycles();
      }
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
      } else {
        const cycleNum = parseInt(cycleValue, 10);
        diff = await api.prs.diff(prId, { cycle: cycleNum });
      }
      setDiffData(diff);
      setSelectedFile(null);
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

  const handleAddComment = async (data: { filePath: string; line: number; body: string; severity: string }) => {
    if (!prId) return;
    await api.comments.create(prId, {
      filePath: data.filePath,
      startLine: data.line,
      endLine: data.line,
      body: data.body,
      severity: data.severity,
      author: 'human',
    });
    await fetchComments();
  };

  const handleReplyComment = async (commentId: string, body: string) => {
    if (!prId) return;
    // Find the parent comment to get its file/line context
    const parent = comments.find((c) => c.id === commentId);
    await api.comments.create(prId, {
      filePath: parent?.filePath || '',
      startLine: parent?.startLine || 0,
      endLine: parent?.endLine || 0,
      body,
      severity: 'suggestion',
      author: 'human',
      parentCommentId: commentId,
    });
    await fetchComments();
  };

  const handleResolveComment = async (commentId: string) => {
    await api.comments.update(commentId, { resolved: true });
    await fetchComments();
  };

  const handleReview = async (action: 'approve' | 'request-changes') => {
    if (!prId) return;
    await api.prs.review(prId, action);
    // Refresh PR to get updated status
    const updatedPr = await api.prs.get(prId);
    setPr(updatedPr);
  };

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
          <h2 className="text-lg font-semibold">{pr.title}</h2>
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
      </div>

      {/* Main content area: file tree + diff viewer */}
      <div className="flex flex-1 overflow-hidden">
        <FileTree
          files={diffData.files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
        <DiffViewer
          diff={diffData.diff}
          files={diffData.files}
          selectedFile={selectedFile}
          comments={comments}
          onAddComment={handleAddComment}
          onReplyComment={handleReplyComment}
          onResolveComment={handleResolveComment}
        />
      </div>

      {/* Review submission bar */}
      <ReviewBar
        prId={prId || ''}
        prStatus={pr.status}
        commentCount={topLevelComments.length}
        onReview={handleReview}
      />
    </div>
  );
}
