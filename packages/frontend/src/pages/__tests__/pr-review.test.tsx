import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PRReview } from '../pr-review.js';

interface WsMessage {
  event: string;
  data: Record<string, unknown>;
}

vi.mock('../../api.js', () => ({
  api: {
    prs: {
      get: vi.fn(),
      diff: vi.fn(),
      cycles: vi.fn(),
      review: vi.fn(),
      cancelAgent: vi.fn(),
      close: vi.fn(),
      reopen: vi.fn(),
      fileGroups: vi.fn(),
    },
    comments: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    insights: {
      get: vi.fn(),
      runAnalyzer: vi.fn(),
    },
  },
}));

let wsCallback: ((message: WsMessage) => void) | undefined;
vi.mock('../../hooks/use-web-socket.js', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation((callback?: (message: WsMessage) => void) => {
      wsCallback = callback;
      return { connected: true };
    }),
}));

vi.mock('../../hooks/use-highlighter.js', () => ({
  useHighlighter: () => ({
    tokenizeLine: () => [],
    syntaxTheme: 'github-dark',
    setSyntaxTheme: () => {
      /* mock */
    },
  }),
  getLangFromPath: () => 'text',
}));

import { api } from '../../api.js';
const mockApi = vi.mocked(api, true);

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 import express from 'express';
-const port = 3000;
+const port = 8080;
 const app = express();`;

const mockPr = {
  id: 'pr-1',
  projectId: 'proj-1',
  title: 'Test PR',
  sourceBranch: 'feat/test',
  baseBranch: 'main',
  status: 'open',
  workingDirectory: undefined,
  agents: {},
};

function renderPRReview() {
  return render(
    <MemoryRouter initialEntries={['/prs/pr-1']}>
      <Routes>
        <Route path="/prs/:prId" element={<PRReview />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PRReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.prs.get.mockResolvedValue(mockPr);
    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
    });
    mockApi.prs.cycles.mockResolvedValue([]);
    mockApi.comments.list.mockResolvedValue([]);
    mockApi.insights.get.mockResolvedValue(undefined);
  });

  it('shows loading state initially', () => {
    mockApi.prs.get.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );
    mockApi.prs.diff.mockReturnValue(
      new Promise(() => {
        /* pending */
      }),
    );
    renderPRReview();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders PR title and branches', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Test PR')).toBeInTheDocument();
    });
  });

  it('renders diff content', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    });
  });

  it('shows error state on load failure', async () => {
    mockApi.prs.get.mockRejectedValue(new Error('Not found'));
    mockApi.prs.diff.mockRejectedValue(new Error('Not found'));
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('renders ReviewBar with Approve and Request Changes', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Request Changes')).toBeInTheDocument();
    });
  });

  it('renders Review and Insights tabs', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });
  });

  it('switches to Insights tab', async () => {
    const user = userEvent.setup();
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    await user.click(screen.getByText('Insights'));
    expect(screen.getByText(/Insights will be available/)).toBeInTheDocument();
  });

  it('shows Close PR button for open PRs', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Close PR')).toBeInTheDocument();
    });
  });

  it('calls close API on Close PR click', async () => {
    const user = userEvent.setup();
    mockApi.prs.close.mockResolvedValue({ ...mockPr, status: 'closed' });
    mockApi.prs.get
      .mockResolvedValueOnce(mockPr)
      .mockResolvedValueOnce({ ...mockPr, status: 'closed' });
    renderPRReview();
    await waitFor(() =>
      expect(screen.getByText('Close PR')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Close PR'));
    expect(mockApi.prs.close).toHaveBeenCalledWith('pr-1');
  });

  it('shows Reopen button for closed PRs', async () => {
    mockApi.prs.get.mockResolvedValue({ ...mockPr, status: 'closed' });
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Reopen')).toBeInTheDocument();
    });
  });

  it('calls reopen API on Reopen click', async () => {
    const user = userEvent.setup();
    mockApi.prs.get.mockResolvedValue({ ...mockPr, status: 'closed' });
    mockApi.prs.reopen.mockResolvedValue({ ...mockPr, status: 'open' });
    renderPRReview();
    await waitFor(() => screen.getByText('Reopen'));

    await user.click(screen.getByText('Reopen'));
    expect(mockApi.prs.reopen).toHaveBeenCalledWith('pr-1');
  });

  it('shows "Comment on PR" button', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Comment on PR')).toBeInTheDocument();
    });
  });

  it('calls review API on Approve click', async () => {
    const user = userEvent.setup();
    mockApi.prs.review.mockResolvedValue({});
    mockApi.prs.get
      .mockResolvedValueOnce(mockPr)
      .mockResolvedValue({ ...mockPr, status: 'approved' });
    renderPRReview();
    await waitFor(() =>
      expect(screen.getByText('Approve')).toBeInTheDocument(),
    );

    await user.click(screen.getByText('Approve'));
    expect(mockApi.prs.review).toHaveBeenCalledWith('pr-1', 'approve');
  });

  it('renders cycle selector when cycles with snapshots exist', async () => {
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'changes_requested',
        reviewedAt: '2026-01-01',
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
      {
        id: 'c2',
        prId: 'pr-1',
        cycleNumber: 2,
        status: 'pending_review',
        reviewedAt: undefined,
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
    ]);
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByLabelText('Viewing:')).toBeInTheDocument();
    });
  });

  it('shows working directory when present', async () => {
    mockApi.prs.get.mockResolvedValue({
      ...mockPr,
      workingDirectory: '/home/user/projects/my-app',
    });
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('projects/my-app')).toBeInTheDocument();
    });
  });

  it('renders file status badges', async () => {
    const diff = `diff --git a/new-file.ts b/new-file.ts
--- /dev/null
+++ b/new-file.ts
@@ -0,0 +1,1 @@
+export const x = 1;`;
    mockApi.prs.diff.mockResolvedValue({ diff, files: ['new-file.ts'] });
    renderPRReview();
    await waitFor(() => {
      expect(screen.getAllByText('new-file.ts').length).toBeGreaterThanOrEqual(
        1,
      );
    });
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows error when API rejects', async () => {
    mockApi.prs.get.mockRejectedValue(new Error('Server error'));
    mockApi.prs.diff.mockRejectedValue(new Error('Server error'));
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('shows status badge in header', async () => {
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('open')).toBeInTheDocument();
    });
  });

  it('renders PR-level comments section when comments exist', async () => {
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: undefined,
        startLine: undefined,
        endLine: undefined,
        body: 'PR-level comment',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('PR-level comment')).toBeInTheDocument();
    });
  });

  it('renders comment filter when multiple cycles exist', async () => {
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'changes_requested',
        reviewedAt: '2026-01-01',
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
      {
        id: 'c2',
        prId: 'pr-1',
        cycleNumber: 2,
        status: 'pending_review',
        reviewedAt: undefined,
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
    ]);
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText(/All/)).toBeInTheDocument();
    });
  });

  it('handles non-string diff gracefully', async () => {
    mockApi.prs.diff.mockResolvedValue({
      diff: undefined as unknown as string,
      files: [],
    });
    renderPRReview();
    await waitFor(() => {
      expect(
        screen.getByText(/Diff snapshot is unavailable/),
      ).toBeInTheDocument();
    });
  });

  it('shows Run Analyzer button on insights tab when comments exist', async () => {
    const user = userEvent.setup();
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Test comment',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    await user.click(screen.getByText('Insights'));
    await waitFor(() => {
      expect(screen.getByText('Run Analyzer')).toBeInTheDocument();
    });
  });

  it('calls cancel agent API', async () => {
    const user = userEvent.setup();
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'agent_working',
        reviewedAt: undefined,
        agentCompletedAt: undefined,
        hasDiffSnapshot: false,
        context: undefined,
      },
    ]);
    mockApi.prs.cancelAgent.mockResolvedValue({});
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Agent working...')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cancel'));
    expect(mockApi.prs.cancelAgent).toHaveBeenCalledWith('pr-1');
  });

  it('renders removed file status', async () => {
    const diff = `diff --git a/old-file.ts b/old-file.ts
--- a/old-file.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const x = 1;`;
    mockApi.prs.diff.mockResolvedValue({ diff, files: ['old-file.ts'] });
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('D')).toBeInTheDocument();
    });
  });

  it('replies to a comment', async () => {
    const user = userEvent.setup();
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Original comment',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    mockApi.comments.create.mockResolvedValue({
      id: 'r1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 1,
      body: 'My reply',
      severity: 'suggestion',
      author: 'human',
      parentCommentId: 'c1',
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    });
    renderPRReview();
    await waitFor(() => screen.getByText('Original comment'));

    const replyBtns = screen.getAllByText('Reply');
    await user.click(replyBtns[0]);

    const textarea = screen.getByPlaceholderText('Write a reply...');
    await user.type(textarea, 'My reply');

    const submitBtns = screen.getAllByText('Reply');
    const lastSubmitButton = submitBtns.at(-1);
    if (lastSubmitButton) await user.click(lastSubmitButton);

    expect(mockApi.comments.create).toHaveBeenCalledWith(
      'pr-1',
      expect.objectContaining({
        body: 'My reply',
        parentCommentId: 'c1',
      } as Record<string, unknown>),
    );
  });

  it('resolves a comment', async () => {
    const user = userEvent.setup();
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Fix this',
        severity: 'must-fix',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    mockApi.comments.update.mockResolvedValue({
      id: 'c1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 1,
      body: 'Fix this',
      severity: 'must-fix',
      author: 'human',
      parentCommentId: undefined,
      resolved: true,
      createdAt: '2026-01-01T00:00:00Z',
    });
    renderPRReview();
    await waitFor(() => screen.getByText('Fix this'));

    await user.click(screen.getByText('Resolve'));
    expect(mockApi.comments.update).toHaveBeenCalledWith('c1', {
      resolved: true,
    });
  });

  it('edits a comment', async () => {
    const user = userEvent.setup();
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Old text',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    mockApi.comments.update.mockResolvedValue({
      id: 'c1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 1,
      body: 'New text',
      severity: 'suggestion',
      author: 'human',
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    });
    renderPRReview();
    await waitFor(() => screen.getByText('Old text'));

    await user.click(screen.getByText('Edit'));
    const textarea = screen.getByDisplayValue('Old text');
    await user.clear(textarea);
    await user.type(textarea, 'New text');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockApi.comments.update).toHaveBeenCalledWith('c1', {
      body: 'New text',
    });
  });

  it('deletes a comment', async () => {
    const user = userEvent.setup();
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Delete me',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    mockApi.comments.delete.mockResolvedValue(undefined);
    renderPRReview();
    await waitFor(() => screen.getByText('Delete me'));

    await user.click(screen.getByText('Delete'));
    expect(mockApi.comments.delete).toHaveBeenCalledWith('c1');
  });

  it('switches cycle and loads new diff', async () => {
    const user = userEvent.setup();
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'changes_requested',
        reviewedAt: '2026-01-01',
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
      {
        id: 'c2',
        prId: 'pr-1',
        cycleNumber: 2,
        status: 'pending_review',
        reviewedAt: undefined,
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
    ]);
    renderPRReview();
    await waitFor(() => screen.getByLabelText('Viewing:'));

    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
    });

    const select = screen.getByLabelText('Viewing:');
    await user.selectOptions(select, '1');

    expect(mockApi.prs.diff).toHaveBeenCalledWith('pr-1', { cycle: 1 });
  });

  it('renders selected cycle context when available', async () => {
    const user = userEvent.setup();
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'changes_requested',
        reviewedAt: '2026-01-01',
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: 'Resubmit with fixes',
      },
    ]);
    renderPRReview();
    await waitFor(() => screen.getByLabelText('Viewing:'));

    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
    });

    const select = screen.getByLabelText('Viewing:');
    await user.selectOptions(select, '1');

    await waitFor(() => {
      expect(screen.getByText(/Resubmit context:/)).toBeInTheDocument();
    });
  });

  it('shows file groups and logical view when diff includes fileGroups', async () => {
    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
      fileGroups: [{ name: 'Core', files: ['src/app.ts'] }],
    });
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('Logical')).toBeInTheDocument();
    });
  });

  it('computes comment counts per file', async () => {
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Comment 1',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        reviewCycleId: 'cycle-1',
        filePath: 'src/app.ts',
        startLine: 2,
        endLine: 2,
        body: 'Comment 2',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    renderPRReview();
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('filters comments when filter is changed', async () => {
    mockApi.prs.cycles.mockResolvedValue([
      {
        id: 'c1',
        prId: 'pr-1',
        cycleNumber: 1,
        status: 'changes_requested',
        reviewedAt: '2026-01-01',
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
      {
        id: 'c2',
        prId: 'pr-1',
        cycleNumber: 2,
        status: 'pending_review',
        reviewedAt: undefined,
        agentCompletedAt: undefined,
        hasDiffSnapshot: true,
        context: undefined,
      },
    ]);
    mockApi.comments.list.mockResolvedValue([
      {
        id: 'c1',
        reviewCycleId: 'c1',
        filePath: 'src/app.ts',
        startLine: 1,
        endLine: 1,
        body: 'Old comment',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        reviewCycleId: 'c1',
        filePath: 'src/app.ts',
        startLine: 2,
        endLine: 2,
        body: 'Replied comment',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: undefined,
        resolved: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'r1',
        reviewCycleId: 'c2',
        filePath: 'src/app.ts',
        startLine: 2,
        endLine: 2,
        body: 'Agent reply',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: 'c2',
        resolved: false,
        createdAt: '2026-01-02T00:00:00Z',
      },
    ]);
    renderPRReview();
    await waitFor(() => screen.getByText('Old comment'));

    expect(
      screen.getByRole('button', { name: /agent replied/i }),
    ).toBeInTheDocument();
  });

  it('handles WebSocket comment:added event by refreshing comments', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));
    mockApi.comments.list.mockResolvedValue([]);

    act(() => {
      wsCallback?.({ event: 'comment:added', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.comments.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles WebSocket review:submitted event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'review:submitted', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.prs.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles WebSocket agent:working event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'agent:working', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.prs.cycles.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles WebSocket agent:working event for insights', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'agent:working', data: { source: 'insights' } });
    });
  });

  it('handles WebSocket agent:completed event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'agent:completed', data: {} });
    });

    await waitFor(() => {
      expect(mockApi.comments.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles WebSocket agent:completed for insights', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'agent:completed', data: { source: 'insights' } });
    });

    await waitFor(() => {
      expect(mockApi.insights.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('handles WebSocket agent:output event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({
        event: 'agent:output',
        data: {
          prId: 'pr-1',
          entry: {
            timestamp: '2026-01-01T12:00:00Z',
            type: 'tool_use',
            summary: 'Running tests',
          },
        },
      });
    });
  });

  it('handles WebSocket agent:output event for insights source', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({
        event: 'agent:output',
        data: {
          prId: 'pr-1',
          source: 'insights',
          entry: {
            timestamp: '2026-01-01T12:00:00Z',
            type: 'tool_use',
            summary: 'Analyzing',
          },
        },
      });
    });
  });

  it('handles WebSocket agent:error event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({
        event: 'agent:error',
        data: { error: 'Something went wrong' },
      });
    });
  });

  it('handles WebSocket agent:error event for insights', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({
        event: 'agent:error',
        data: { source: 'insights', error: 'Analyzer failed' },
      });
    });
  });

  it('handles WebSocket agent:cancelled event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'agent:cancelled', data: {} });
    });
  });

  it('handles WebSocket pr:updated event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'pr:updated', data: {} });
    });
  });

  it('handles WebSocket pr:ready-for-review event', async () => {
    renderPRReview();
    await waitFor(() => screen.getByText('Test PR'));

    act(() => {
      wsCallback?.({ event: 'pr:ready-for-review', data: {} });
    });
  });

  it('handles request-changes review', async () => {
    const user = userEvent.setup();
    mockApi.prs.review.mockResolvedValue({});
    mockApi.prs.get.mockResolvedValueOnce(mockPr).mockResolvedValue(mockPr);
    renderPRReview();
    await waitFor(() => screen.getByText('Request Changes'));

    await user.click(screen.getByText('Request Changes'));
    expect(mockApi.prs.review).toHaveBeenCalledWith('pr-1', 'request-changes');
  });
});
