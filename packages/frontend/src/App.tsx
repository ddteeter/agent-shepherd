import { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { ProjectView } from './pages/ProjectView.js';
import { PRReview } from './pages/PRReview.js';
import { useTheme } from './hooks/useTheme.js';
import type { Theme } from './hooks/useTheme.js';
import { THEME_GROUPS, AVAILABLE_THEMES, getStoredSyntaxTheme } from './hooks/useHighlighter.js';

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
  const [syntaxTheme, setSyntaxThemeState] = useState(getStoredSyntaxTheme);

  const setSyntaxTheme = useCallback((value: string) => {
    setSyntaxThemeState(value);
    try {
      localStorage.setItem('shepherd-syntax-theme', value);
      window.dispatchEvent(new StorageEvent('storage', { key: 'shepherd-syntax-theme', newValue: value }));
    } catch {}
  }, []);

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3 shrink-0 flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
        <div className="flex items-center gap-3">
          <select
            value={syntaxTheme}
            onChange={(e) => setSyntaxTheme(e.target.value)}
            className="text-sm px-2 py-1 rounded border cursor-pointer"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
            title="Syntax highlighting theme"
          >
            {THEME_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.themes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ))}
            <optgroup label="All Themes">
              {AVAILABLE_THEMES.filter(
                (id) => !THEME_GROUPS.some((g) => g.themes.some((t) => t.id === id))
              ).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </optgroup>
          </select>
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
        </div>
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
