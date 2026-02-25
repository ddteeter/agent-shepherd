import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [tab, setTab] = useState<'open' | 'approved' | 'closed'>('open');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      api.projects.get(projectId),
      api.prs.list(projectId),
    ]).then(([proj, prList]) => {
      setProject(proj);
      setPrs(prList);
    }).finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-6">Loading...</div>;

  const filtered = prs.filter((pr) => pr.status === tab);

  const tabs = ['open', 'approved', 'closed'] as const;

  return (
    <div>
      <div className="mb-4">
        <Link to="/" className="text-sm opacity-70 hover:opacity-100">&larr; All Projects</Link>
        <h2 className="text-lg font-semibold mt-1">{project?.name}</h2>
        <p className="text-sm opacity-70">{project?.path}</p>
      </div>

      <div className="flex gap-4 border-b mb-4" style={{ borderColor: 'var(--color-border)' }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm capitalize ${tab === t ? 'border-b-2 font-medium' : 'opacity-70'}`}
            style={tab === t ? { borderColor: 'var(--color-accent)' } : {}}
          >
            {t} ({prs.filter((pr) => pr.status === t).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm opacity-70">No {tab} pull requests.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((pr) => (
            <li key={pr.id}>
              <Link
                to={`/prs/${pr.id}`}
                className="block p-4 rounded border hover:border-blue-400 transition-colors"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
              >
                <div className="font-medium">{pr.title}</div>
                <div className="text-sm opacity-70">
                  {pr.sourceBranch} &rarr; {pr.baseBranch}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
