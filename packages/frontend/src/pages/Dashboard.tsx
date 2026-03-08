import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.projects
      .list()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-sm opacity-70">
          No projects registered. Use{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
            shepherd init
          </code>{' '}
          to register a project.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className="block p-4 rounded border hover:border-blue-400 transition-colors"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg-secondary)',
                }}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-sm opacity-70">{p.path}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
