import { getSessionToken } from './session-token.js';

const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'X-Session-Token': getSessionToken(),
  };
  if (opts?.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as T;
}

export const api = {
  projects: {
    list: () => request<any[]>('/projects'),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (data: any) =>
      request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  prs: {
    list: (projectId: string) => request<any[]>(`/projects/${projectId}/prs`),
    get: (id: string) => request<any>(`/prs/${id}`),
    diff: (
      id: string,
      opts?: { cycle?: number; from?: number; to?: number },
    ) => {
      const params = new URLSearchParams();
      if (opts?.cycle !== undefined) params.set('cycle', String(opts.cycle));
      if (opts?.from !== undefined) params.set('from', String(opts.from));
      if (opts?.to !== undefined) params.set('to', String(opts.to));
      const qs = params.toString();
      return request<any>(`/prs/${id}/diff${qs ? `?${qs}` : ''}`);
    },
    cycles: (id: string) => request<any[]>(`/prs/${id}/cycles/details`),
    fileGroups: (id: string, opts?: { cycle?: number }) => {
      const params = new URLSearchParams();
      if (opts?.cycle !== undefined) params.set('cycle', String(opts.cycle));
      const qs = params.toString();
      return request<{ fileGroups: any[] | null; cycleNumber: number }>(
        `/prs/${id}/file-groups${qs ? `?${qs}` : ''}`,
      );
    },
    snapshotDiff: (id: string) =>
      request<any>(`/prs/${id}/diff/snapshot`, { method: 'POST' }),
    review: (id: string, action: string) =>
      request<any>(`/prs/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    cancelAgent: (id: string, source?: string) => {
      const params = source ? `?source=${source}` : '';
      return request<any>(`/prs/${id}/cancel-agent${params}`, {
        method: 'POST',
      });
    },
    close: (id: string) => request<any>(`/prs/${id}/close`, { method: 'POST' }),
    reopen: (id: string) =>
      request<any>(`/prs/${id}/reopen`, { method: 'POST' }),
  },
  comments: {
    list: (prId: string) => request<any[]>(`/prs/${prId}/comments`),
    create: (prId: string, data: any) =>
      request<any>(`/prs/${prId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      request<any>(`/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/comments/${id}`, { method: 'DELETE' }),
  },
  insights: {
    get: (prId: string) => request<any | null>(`/prs/${prId}/insights`),
    runAnalyzer: (prId: string) =>
      request<any>(`/prs/${prId}/run-insights`, { method: 'POST' }),
  },
};
