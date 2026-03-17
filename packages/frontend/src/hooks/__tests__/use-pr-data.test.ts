import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePrData } from '../use-pr-data.js';

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

let wsCallback:
  | ((message: { event: string; data: Record<string, unknown> }) => void)
  | undefined;
vi.mock('../use-web-socket.js', () => ({
  useWebSocket: vi
    .fn()
    .mockImplementation(
      (
        callback?: (message: {
          event: string;
          data: Record<string, unknown>;
        }) => void,
      ) => {
        wsCallback = callback;
        return { connected: true };
      },
    ),
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

describe('usePrData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.prs.get.mockResolvedValue({
      id: 'pr-1',
      projectId: 'proj-1',
      title: 'Test PR',
      sourceBranch: 'feat/test',
      baseBranch: 'main',
      status: 'open',
    });
    mockApi.prs.diff.mockResolvedValue({
      diff: SIMPLE_DIFF,
      files: ['src/app.ts'],
    });
    mockApi.prs.cycles.mockResolvedValue([]);
    mockApi.comments.list.mockResolvedValue([]);
    mockApi.insights.get.mockResolvedValue(undefined);
  });

  it('loads PR data on mount', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.pr?.title).toBe('Test PR');
    expect(result.current.diffData?.files).toEqual(['src/app.ts']);
  });

  it('sets loading true initially', () => {
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
    const { result } = renderHook(() => usePrData('pr-1'));
    expect(result.current.loading).toBe(true);
  });

  it('sets error on load failure', async () => {
    mockApi.prs.get.mockRejectedValue(new Error('Not found'));
    mockApi.prs.diff.mockRejectedValue(new Error('Not found'));
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
  });

  it('computes fileStatuses from diff', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.fileStatuses['src/app.ts']).toBe('modified');
  });

  it('handles WebSocket comment:added by refetching', async () => {
    const { result } = renderHook(() => usePrData('pr-1'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    mockApi.comments.list.mockResolvedValue([]);
    act(() => {
      wsCallback?.({ event: 'comment:added', data: {} });
    });
    await waitFor(() => {
      expect(mockApi.comments.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('returns undefined for no prId', () => {
    const { result } = renderHook(() => usePrData(undefined));
    expect(result.current.loading).toBe(true);
    expect(result.current.pr).toBeUndefined();
  });
});
