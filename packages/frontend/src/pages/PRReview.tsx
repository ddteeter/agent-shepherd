import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { FileTree } from '../components/FileTree.js';
import { DiffViewer } from '../components/DiffViewer.js';

export function PRReview() {
  const { prId } = useParams<{ prId: string }>();
  const [pr, setPr] = useState<any>(null);
  const [diffData, setDiffData] = useState<{ diff: string; files: string[] } | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [prId]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error}</div>;
  if (!pr || !diffData) return <div className="p-6">PR not found</div>;

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
        />
      </div>
    </div>
  );
}
