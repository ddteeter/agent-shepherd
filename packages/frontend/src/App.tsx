import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { ProjectView } from './pages/ProjectView.js';

export function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          <Route path="/prs/:prId" element={<div>PR Review - Coming in Task 16</div>} />
        </Routes>
      </main>
    </div>
  );
}
