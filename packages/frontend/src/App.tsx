import { Routes, Route } from 'react-router-dom';

export function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <header className="border-b px-6 py-3" style={{ borderColor: 'var(--color-border)' }}>
        <h1 className="text-xl font-semibold">Agent Shepherd</h1>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<div>Dashboard - Coming Soon</div>} />
        </Routes>
      </main>
    </div>
  );
}
