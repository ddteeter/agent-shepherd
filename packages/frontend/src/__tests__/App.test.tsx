import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App.js';

// Mock pages to avoid their complex dependencies
vi.mock('../pages/Dashboard.js', () => ({
  Dashboard: () => <div data-testid="dashboard">Dashboard</div>,
}));
vi.mock('../pages/ProjectView.js', () => ({
  ProjectView: () => <div data-testid="project-view">ProjectView</div>,
}));
vi.mock('../pages/PRReview.js', () => ({
  PRReview: () => <div data-testid="pr-review">PRReview</div>,
}));

// Mock the hooks
vi.mock('../hooks/useHighlighter.js', () => ({
  getStoredSyntaxTheme: () => 'github-dark',
  THEME_GROUPS: [
    { label: 'GitHub', themes: [{ id: 'github-dark', name: 'GitHub Dark' }, { id: 'github-light', name: 'GitHub Light' }] },
  ],
  AVAILABLE_THEMES: ['github-dark', 'github-light', 'nord'],
}));

vi.mock('../hooks/useSyntaxThemeColors.js', () => ({
  useSyntaxThemeColors: vi.fn(),
}));

describe('App', () => {
  it('renders header with title', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Agent Shepherd')).toBeInTheDocument();
  });

  it('renders Dashboard at root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('renders ProjectView at /projects/:projectId', () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-1']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('project-view')).toBeInTheDocument();
  });

  it('renders PRReview at /prs/:prId', () => {
    render(
      <MemoryRouter initialEntries={['/prs/pr-1']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('pr-review')).toBeInTheDocument();
  });

  it('renders theme selector with grouped themes', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const select = screen.getByTitle('Syntax highlighting theme');
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue('github-dark');
  });

  it('changes theme on selection', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const select = screen.getByTitle('Syntax highlighting theme');
    await user.selectOptions(select, 'github-light');
    expect(select).toHaveValue('github-light');
  });

  it('updates theme state on selection change', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const select = screen.getByTitle('Syntax highlighting theme');
    expect(select).toHaveValue('github-dark');
    await user.selectOptions(select, 'github-light');
    expect(select).toHaveValue('github-light');
  });
});
