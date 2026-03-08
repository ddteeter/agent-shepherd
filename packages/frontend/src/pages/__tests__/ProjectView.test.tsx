import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProjectView } from '../ProjectView.js';

vi.mock('../../api.js', () => ({
  api: {
    projects: {
      get: vi.fn(),
    },
    prs: {
      list: vi.fn(),
      close: vi.fn(),
      reopen: vi.fn(),
    },
  },
}));

let pvWsCallback: ((message: any) => void) | undefined;
vi.mock('../../hooks/useWebSocket.js', () => ({
  useWebSocket: vi.fn().mockImplementation((callback?: (message: any) => void) => {
    pvWsCallback = callback;
    return { connected: true };
  }),
}));

import { api } from '../../api.js';
const mockApi = vi.mocked(api, true);

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/projects/proj-1']}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.projects.get.mockResolvedValue({
      id: 'proj-1',
      name: 'Test Project',
      path: '/tmp/test',
    });
    mockApi.prs.list.mockResolvedValue([
      {
        id: 'pr-1',
        title: 'Add feature',
        sourceBranch: 'feat/x',
        baseBranch: 'main',
        status: 'open',
      },
      {
        id: 'pr-2',
        title: 'Old PR',
        sourceBranch: 'fix/y',
        baseBranch: 'main',
        status: 'approved',
      },
      {
        id: 'pr-3',
        title: 'Closed PR',
        sourceBranch: 'fix/z',
        baseBranch: 'main',
        status: 'closed',
      },
    ]);
  });

  it('shows loading state initially', () => {
    mockApi.projects.get.mockReturnValue(new Promise(() => {}));
    mockApi.prs.list.mockReturnValue(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders project name and PR list', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
      expect(screen.getByText('Add feature')).toBeInTheDocument();
    });
  });

  it('shows tabs with counts', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText(/open/i)).toBeInTheDocument();
      expect(screen.getByText(/approved/i)).toBeInTheDocument();
      expect(screen.getByText(/closed/i)).toBeInTheDocument();
    });
  });

  it('switches tabs to show different PRs', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Add feature')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /approved/i }));
    expect(screen.getByText('Old PR')).toBeInTheDocument();
    expect(screen.queryByText('Add feature')).not.toBeInTheDocument();
  });

  it('shows Close button for open PRs', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });
  });

  it('calls api.prs.close on close button click', async () => {
    const user = userEvent.setup();
    mockApi.prs.close.mockResolvedValue({ id: 'pr-1', status: 'closed' });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Close'));
    expect(mockApi.prs.close).toHaveBeenCalledWith('pr-1');
  });

  it('shows Reopen button for closed PRs', async () => {
    const user = userEvent.setup();
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    await user.click(screen.getByRole('button', { name: /closed/i }));
    expect(screen.getByText('Reopen')).toBeInTheDocument();
  });

  it('calls api.prs.reopen on reopen button click', async () => {
    const user = userEvent.setup();
    mockApi.prs.reopen.mockResolvedValue({ id: 'pr-3', status: 'open' });
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    await user.click(screen.getByRole('button', { name: /closed/i }));
    await user.click(screen.getByText('Reopen'));
    expect(mockApi.prs.reopen).toHaveBeenCalledWith('pr-3');
  });

  it('refreshes PR list on WebSocket pr:created event', async () => {
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    act(() => {
      pvWsCallback?.({ event: 'pr:created', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.prs.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('refreshes PR list on WebSocket pr:updated event', async () => {
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    act(() => {
      pvWsCallback?.({ event: 'pr:updated', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.prs.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('refreshes PR list on WebSocket review:submitted event', async () => {
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    act(() => {
      pvWsCallback?.({ event: 'review:submitted', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.prs.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('refreshes PR list on WebSocket agent:completed event', async () => {
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    act(() => {
      pvWsCallback?.({ event: 'agent:completed', data: {} });
    });
  });

  it('refreshes PR list on WebSocket agent:error event', async () => {
    renderWithRouter();
    await waitFor(() => screen.getByText('Test Project'));

    act(() => {
      pvWsCallback?.({ event: 'agent:error', data: {} });
    });
  });

  it('shows empty state when no PRs match tab', async () => {
    const user = userEvent.setup();
    mockApi.prs.list.mockResolvedValue([
      {
        id: 'pr-1',
        title: 'Add feature',
        sourceBranch: 'feat/x',
        baseBranch: 'main',
        status: 'open',
      },
    ]);
    renderWithRouter();
    await waitFor(() => screen.getByText('Add feature'));

    await user.click(screen.getByRole('button', { name: /approved/i }));
    expect(screen.getByText(/No approved pull requests/)).toBeInTheDocument();
  });
});
