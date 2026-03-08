import { useState, useCallback } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';
import { ProjectView } from './pages/ProjectView.js';
import { PRReview } from './pages/PRReview.js';
import {
  THEME_GROUPS,
  AVAILABLE_THEMES,
  getStoredSyntaxTheme,
} from './hooks/useHighlighter.js';
import { useSyntaxThemeColors } from './hooks/useSyntaxThemeColors.js';
import logoIcon from './icons/agent-shepherd-logo-192-192.png';

export function App() {
  const [syntaxTheme, setSyntaxThemeState] = useState(getStoredSyntaxTheme);
  useSyntaxThemeColors(syntaxTheme);

  const setSyntaxTheme = useCallback((value: string) => {
    setSyntaxThemeState(value);
    try {
      localStorage.setItem('shepherd-syntax-theme', value);
      globalThis.dispatchEvent(
        new StorageEvent('storage', {
          key: 'shepherd-syntax-theme',
          newValue: value,
        }),
      );
    } catch {}
  }, []);

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <header
        className="border-b px-6 py-3 shrink-0 flex items-center justify-between"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <Link
          to="/"
          className="text-xl font-semibold flex items-center gap-2 no-underline"
          style={{ color: 'inherit' }}
        >
          <img src={logoIcon} alt="" className="h-6 w-6 rounded-sm" />
          Agent Shepherd
        </Link>
        <div className="flex items-center gap-3">
          <select
            value={syntaxTheme}
            onChange={(e) => { setSyntaxTheme(e.target.value); }}
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
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="All Themes">
              {AVAILABLE_THEMES.filter(
                (id) =>
                  !THEME_GROUPS.some((g) => g.themes.some((t) => t.id === id)),
              ).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <div className="p-6 overflow-y-auto h-full">
                <Dashboard />
              </div>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <div className="p-6 overflow-y-auto h-full">
                <ProjectView />
              </div>
            }
          />
          <Route path="/prs/:prId" element={<PRReview />} />
        </Routes>
      </main>
    </div>
  );
}
