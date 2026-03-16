import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import type { Project } from '../api.js';
import { useWebSocket } from '../hooks/use-web-socket.js';

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.projects
      .list()
      .then(setProjects)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useWebSocket((message) => {
    if (
      message.event === 'pr:created' ||
      message.event === 'pr:updated' ||
      message.event === 'review:submitted' ||
      message.event === 'agent:completed' ||
      message.event === 'agent:error' ||
      message.event === 'project:created'
    ) {
      void api.projects.list().then(setProjects);
    }
  });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Projects</h2>
      {projects.length === 0 ? (
        <p className="text-sm opacity-70">
          No projects registered. Use{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
            agent-shepherd init
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
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.pendingReviewCount > 0 && (
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      {p.pendingReviewCount} pending
                    </span>
                  )}
                </div>
                <div className="text-sm opacity-70">{p.path}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
