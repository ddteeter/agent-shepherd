import { getSessionToken } from './session-token.js';

const BASE = '/api';

export interface Project {
  id: string;
  name: string;
  path: string;
  pendingReviewCount: number;
}

export interface PullRequest {
  id: string;
  projectId: string;
  title: string;
  sourceBranch: string;
  baseBranch: string;
  status: string;
  workingDirectory?: string;
  agents?: Record<string, unknown>;
}

interface DiffResponse {
  diff: string;
  files: string[];
  fileGroups?: { name: string; description?: string; files: string[] }[];
}

interface ReviewCycleDetail {
  id: string;
  prId: string;
  cycleNumber: number;
  status: string;
  reviewedAt: string | undefined;
  agentCompletedAt: string | undefined;
  hasDiffSnapshot: boolean;
  context: string | undefined;
}

interface CommentData {
  id: string;
  reviewCycleId: string;
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  side?: 'old' | 'new';
  body: string;
  type: string;
  author: string;
  parentCommentId: string | undefined;
  resolved: boolean;
  createdAt: string;
}

interface InsightsResponse {
  categories: Record<string, unknown>;
  branchRef: string | undefined;
  updatedAt: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'X-Session-Token': getSessionToken(),
  };
  if (options?.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  if (!response.ok)
    throw new Error(`${String(response.status)}: ${await response.text()}`);
  if (response.status === 204) return undefined as T;
  return response.json() as T;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; path?: string }) =>
      request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  prs: {
    list: (projectId: string) =>
      request<PullRequest[]>(`/projects/${projectId}/prs`),
    get: (id: string) => request<PullRequest>(`/prs/${id}`),
    diff: (
      id: string,
      options?: { cycle?: number; from?: number; to?: number },
    ) => {
      const parameters = new URLSearchParams();
      if (options?.cycle !== undefined)
        parameters.set('cycle', String(options.cycle));
      if (options?.from !== undefined)
        parameters.set('from', String(options.from));
      if (options?.to !== undefined) parameters.set('to', String(options.to));
      const qs = parameters.toString();
      const queryString = qs ? `?${qs}` : '';
      return request<DiffResponse>(`/prs/${id}/diff${queryString}`);
    },
    cycles: (id: string) =>
      request<ReviewCycleDetail[]>(`/prs/${id}/cycles/details`),
    fileGroups: (id: string, options?: { cycle?: number }) => {
      const parameters = new URLSearchParams();
      if (options?.cycle !== undefined)
        parameters.set('cycle', String(options.cycle));
      const qs = parameters.toString();
      const queryString = qs ? `?${qs}` : '';
      return request<{
        fileGroups: { name: string; files: string[] }[] | undefined;
        cycleNumber: number;
      }>(`/prs/${id}/file-groups${queryString}`);
    },
    snapshotDiff: (id: string) =>
      request<Record<string, unknown>>(`/prs/${id}/diff/snapshot`, {
        method: 'POST',
      }),
    review: (id: string, action: string) =>
      request<Record<string, unknown>>(`/prs/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    cancelAgent: (id: string, source?: string) => {
      const parameters = source ? `?source=${source}` : '';
      return request<Record<string, unknown>>(
        `/prs/${id}/cancel-agent${parameters}`,
        {
          method: 'POST',
        },
      );
    },
    close: (id: string) =>
      request<PullRequest>(`/prs/${id}/close`, { method: 'POST' }),
    reopen: (id: string) =>
      request<PullRequest>(`/prs/${id}/reopen`, { method: 'POST' }),
  },
  comments: {
    list: (prId: string) => request<CommentData[]>(`/prs/${prId}/comments`),
    create: (prId: string, data: Record<string, unknown>) =>
      request<CommentData>(`/prs/${prId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      request<CommentData>(`/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<undefined>(`/comments/${id}`, { method: 'DELETE' }),
  },
  insights: {
    get: (prId: string) =>
      request<InsightsResponse | undefined>(`/prs/${prId}/insights`),
    runAnalyzer: (prId: string) =>
      request<Record<string, unknown>>(`/prs/${prId}/run-insights`, {
        method: 'POST',
      }),
  },
};
