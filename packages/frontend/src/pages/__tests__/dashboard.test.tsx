import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../dashboard.js';

vi.mock('../../api.js', () => ({
  api: {
    projects: {
      list: vi.fn(),
    },
  },
}));

interface WsMessage {
  event: string;
  data: Record<string, unknown>;
}

let dashboardWsCallback: ((message: WsMessage) => void) | undefined;
vi.mock('../../hooks/use-web-socket.js', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation((callback?: (message: WsMessage) => void) => {
      dashboardWsCallback = callback;
      return { connected: true };
    }),
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
      {
        id: 'p1',
        name: 'My Project',
        path: '/home/user/project',
        pendingReviewCount: 2,
      },
      {
        id: 'p2',
        name: 'Another',
        path: '/tmp/another',
        pendingReviewCount: 0,
      },
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

  it('shows pending review badge when count > 0', async () => {
    mockApi.projects.list.mockResolvedValue([
      {
        id: 'p1',
        name: 'My Project',
        path: '/home/user/project',
        pendingReviewCount: 3,
      },
      {
        id: 'p2',
        name: 'Another',
        path: '/tmp/another',
        pendingReviewCount: 0,
      },
    ]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('3 pending')).toBeInTheDocument();
      expect(screen.queryByText('0 pending')).not.toBeInTheDocument();
    });
  });

  it('refetches projects when pr:created WebSocket event fires', async () => {
    mockApi.projects.list.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'My Project',
        path: '/tmp/p',
        pendingReviewCount: 0,
      },
    ]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText('My Project')).toBeInTheDocument();
    });

    mockApi.projects.list.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'My Project',
        path: '/tmp/p',
        pendingReviewCount: 1,
      },
    ]);
    act(() => {
      dashboardWsCallback?.({ event: 'pr:created', data: {} });
    });

    await waitFor(() => {
      expect(screen.getByText('1 pending')).toBeInTheDocument();
    });
  });

  it('refetches projects when project:created WebSocket event fires', async () => {
    mockApi.projects.list.mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No projects registered/)).toBeInTheDocument();
    });

    mockApi.projects.list.mockResolvedValueOnce([
      {
        id: 'p1',
        name: 'New Project',
        path: '/tmp/new',
        pendingReviewCount: 0,
      },
    ]);
    act(() => {
      dashboardWsCallback?.({ event: 'project:created', data: {} });
    });

    await waitFor(() => {
      expect(screen.getByText('New Project')).toBeInTheDocument();
    });
  });

  it('renders project links with correct hrefs', async () => {
    mockApi.projects.list.mockResolvedValue([
      {
        id: 'p1',
        name: 'My Project',
        path: '/home/user/project',
        pendingReviewCount: 0,
      },
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
