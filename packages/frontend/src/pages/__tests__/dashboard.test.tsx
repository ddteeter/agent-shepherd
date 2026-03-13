import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../dashboard.js';

vi.mock('../../api.js', () => ({
  api: {
    projects: {
      list: vi.fn(),
    },
  },
}));

import { api } from '../../api.js';
const mockApi = vi.mocked(api, true);

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockApi.projects.list.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state when no projects', async () => {
    mockApi.projects.list.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No projects registered/)).toBeInTheDocument();
    });
  });

  it('renders project list', async () => {
    mockApi.projects.list.mockResolvedValue([
      { id: 'p1', name: 'My Project', path: '/home/user/project' },
      { id: 'p2', name: 'Another', path: '/tmp/another' },
    ]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('My Project')).toBeInTheDocument();
      expect(screen.getByText('Another')).toBeInTheDocument();
    });
  });

  it('renders project links with correct hrefs', async () => {
    mockApi.projects.list.mockResolvedValue([
      { id: 'p1', name: 'My Project', path: '/home/user/project' },
    ]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const link = screen.getByText('My Project').closest('a');
      expect(link?.getAttribute('href')).toBe('/projects/p1');
    });
  });
});
