import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { ProjectView } from './pages/ProjectView.js';
import { PRReview } from './pages/PRReview.js';

export function App() {
  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3 shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<div className="p-6 overflow-y-auto h-full"><Dashboard /></div>} />
          <Route path="/projects/:projectId" element={<div className="p-6 overflow-y-auto h-full"><ProjectView /></div>} />
          <Route path="/prs/:prId" element={<PRReview />} />
        </Routes>
      </main>
    </div>
  );
}
