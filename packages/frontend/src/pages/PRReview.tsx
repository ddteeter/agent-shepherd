import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileTree } from '../components/FileTree.js';
import { DiffViewer } from '../components/DiffViewer.js';
import { ReviewBar } from '../components/ReviewBar.js';
import type { Comment } from '../components/CommentThread.js';

export function PRReview() {
  const { prId } = useParams<{ prId: string }>();
  const [pr, setPr] = useState<any>(null);
  const [diffData, setDiffData] = useState<{ diff: string; files: string[] } | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!prId) return;
    try {
      const data = await api.comments.list(prId);
      setComments(data as Comment[]);
    } catch {
      // Comments may not exist yet, ignore errors
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
  }, [prId, fetchComments]);

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

  return (
    <div className="flex flex-col h-full">
      {/* PR Header */}
      <div className="px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <Link to={`/projects/${pr.projectId}`} className="text-sm opacity-70 hover:opacity-100">
          &larr; Back
        </Link>
        <h2 className="text-lg font-semibold">{pr.title}</h2>
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
