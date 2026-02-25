import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { ProjectView } from './pages/ProjectView.js';
import { PRReview } from './pages/PRReview.js';
import { useTheme } from './hooks/useTheme.js';
import type { Theme } from './hooks/useTheme.js';

const themeLabels: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const themeIcons: Record<Theme, string> = {
  system: '\u{1F5A5}',
  light: '\u2600',
  dark: '\u{1F319}',
};

export function App() {
  const { theme, cycleTheme } = useTheme();

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3 shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
        <button
          onClick={cycleTheme}
          className="text-sm px-3 py-1 rounded border cursor-pointer"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
          title={`Theme: ${themeLabels[theme]}. Click to cycle.`}
        >
          {themeIcons[theme]} {themeLabels[theme]}
        </button>
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
