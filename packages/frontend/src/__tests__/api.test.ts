import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api.js';

// Mock the session token
vi.mock('../session-token.js', () => ({
  getSessionToken: () => 'mock-token',
}));

describe('api', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(data: any, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  }

  function mock204() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.resolve(),
      text: () => Promise.resolve(''),
    });
  }

  function mockError(status: number, message: string) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: () => Promise.resolve(message),
    });
  }

  describe('request helper', () => {
    it('includes session token header', async () => {
      mockResponse([]);
      await api.projects.list();
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Session-Token': 'mock-token' }),
        }),
      );
    });

    it('includes Content-Type for requests with body', async () => {
      mockResponse({ id: '1' });
      await api.projects.create({ name: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          method: 'POST',
          body: JSON.stringify({ name: 'test' }),
        }),
      );
    });

    it('throws on non-ok response', async () => {
      mockError(404, 'Not found');
      await expect(api.projects.get('bad-id')).rejects.toThrow(
        '404: Not found',
      );
    });

    it('returns undefined for 204 status', async () => {
      mock204();
      const result = await api.comments.delete('c1');
      expect(result).toBeUndefined();
    });
  });

  describe('projects', () => {
    it('list calls GET /projects', async () => {
      mockResponse([{ id: '1' }]);
      const result = await api.projects.list();
      expect(result).toEqual([{ id: '1' }]);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.anything(),
      );
    });

    it('get calls GET /projects/:id', async () => {
      mockResponse({ id: '1' });
      await api.projects.get('1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/1',
        expect.anything(),
      );
    });

    it('create calls POST /projects', async () => {
      mockResponse({ id: '1' });
      await api.projects.create({ name: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('prs', () => {
    it('list calls GET /projects/:id/prs', async () => {
      mockResponse([]);
      await api.prs.list('proj-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/projects/proj-1/prs',
        expect.anything(),
      );
    });

    it('get calls GET /prs/:id', async () => {
      mockResponse({ id: 'pr-1' });
      await api.prs.get('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1',
        expect.anything(),
      );
    });

    it('diff calls GET /prs/:id/diff with no params', async () => {
      mockResponse({ diff: '', files: [] });
      await api.prs.diff('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/diff',
        expect.anything(),
      );
    });

    it('diff passes cycle param', async () => {
      mockResponse({ diff: '', files: [] });
      await api.prs.diff('pr-1', { cycle: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/diff?cycle=2',
        expect.anything(),
      );
    });

    it('diff passes from and to params', async () => {
      mockResponse({ diff: '', files: [] });
      await api.prs.diff('pr-1', { from: 1, to: 3 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/diff?from=1&to=3',
        expect.anything(),
      );
    });

    it('cycles calls GET /prs/:id/cycles/details', async () => {
      mockResponse([]);
      await api.prs.cycles('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/cycles/details',
        expect.anything(),
      );
    });

    it('fileGroups calls GET /prs/:id/file-groups', async () => {
      mockResponse({ fileGroups: null, cycleNumber: 1 });
      await api.prs.fileGroups('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/file-groups',
        expect.anything(),
      );
    });

    it('fileGroups passes cycle param', async () => {
      mockResponse({ fileGroups: null, cycleNumber: 2 });
      await api.prs.fileGroups('pr-1', { cycle: 2 });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/file-groups?cycle=2',
        expect.anything(),
      );
    });

    it('snapshotDiff calls POST', async () => {
      mockResponse({});
      await api.prs.snapshotDiff('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/diff/snapshot',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('review calls POST with action', async () => {
      mockResponse({});
      await api.prs.review('pr-1', 'approve');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/review',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'approve' }),
        }),
      );
    });

    it('cancelAgent calls POST with source param', async () => {
      mockResponse({});
      await api.prs.cancelAgent('pr-1', 'insights');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/cancel-agent?source=insights',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('cancelAgent calls POST without source param', async () => {
      mockResponse({});
      await api.prs.cancelAgent('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/cancel-agent',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('close calls POST', async () => {
      mockResponse({});
      await api.prs.close('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/close',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('reopen calls POST', async () => {
      mockResponse({});
      await api.prs.reopen('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/reopen',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('comments', () => {
    it('list calls GET /prs/:id/comments', async () => {
      mockResponse([]);
      await api.comments.list('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/comments',
        expect.anything(),
      );
    });

    it('create calls POST /prs/:id/comments', async () => {
      mockResponse({ id: 'c1' });
      await api.comments.create('pr-1', { body: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/comments',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('update calls PUT /comments/:id', async () => {
      mockResponse({ id: 'c1' });
      await api.comments.update('c1', { body: 'updated' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/comments/c1',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('delete calls DELETE /comments/:id', async () => {
      mock204();
      await api.comments.delete('c1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/comments/c1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('insights', () => {
    it('get calls GET /prs/:id/insights', async () => {
      mockResponse(null);
      await api.insights.get('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/insights',
        expect.anything(),
      );
    });

    it('runAnalyzer calls POST /prs/:id/run-insights', async () => {
      mockResponse({});
      await api.insights.runAnalyzer('pr-1');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/prs/pr-1/run-insights',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
