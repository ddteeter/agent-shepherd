const BASE = '/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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
    create: (data: any) => request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  prs: {
    list: (projectId: string) => request<any[]>(`/projects/${projectId}/prs`),
    get: (id: string) => request<any>(`/prs/${id}`),
    diff: (id: string) => request<any>(`/prs/${id}/diff`),
    review: (id: string, action: string) =>
      request<any>(`/prs/${id}/review`, { method: 'POST', body: JSON.stringify({ action }) }),
  },
  comments: {
    list: (prId: string) => request<any[]>(`/prs/${prId}/comments`),
    create: (prId: string, data: any) =>
      request<any>(`/prs/${prId}/comments`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/comments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
};
