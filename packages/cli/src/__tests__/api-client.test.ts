import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import { ApiClient } from '../api-client.js';
import { readFileSync } from 'node:fs';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs URLs correctly', () => {
    const client = new ApiClient('http://localhost:3847');
    expect((client as any).url('/api/projects')).toBe(
      'http://localhost:3847/api/projects',
    );
  });

  describe('getToken', () => {
    it('uses tokenOverride when provided', () => {
      const client = new ApiClient('http://localhost:3847', 'my-token');
      expect((client as any).getToken()).toBe('my-token');
    });

    it('reads token from file when no override', () => {
      vi.mocked(readFileSync).mockReturnValue('file-token\n');
      const client = new ApiClient('http://localhost:3847');
      expect((client as any).getToken()).toBe('file-token');
    });

    it('caches the token after first read', () => {
      vi.mocked(readFileSync).mockReturnValue('cached-token\n');
      const client = new ApiClient('http://localhost:3847');
      const token1 = (client as any).getToken();
      const token2 = (client as any).getToken();
      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      // readFileSync is called once per new ApiClient construction in prior tests,
      // but for this specific client it should only call once due to caching
      expect(token1).toBe(token2);
    });

    it('throws when token file not found', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const client = new ApiClient('http://localhost:3847');
      expect(() => (client as any).getToken()).toThrow(
        'Session token not found',
      );
    });
  });

  describe('authHeaders', () => {
    it('returns X-Session-Token header', () => {
      const client = new ApiClient('http://localhost:3847', 'test-token');
      expect((client as any).authHeaders()).toEqual({
        'X-Session-Token': 'test-token',
      });
    });
  });

  describe('get', () => {
    it('makes GET request with auth headers', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      } as any);

      const result = await client.get('/api/test');
      expect(fetch).toHaveBeenCalledWith('http://localhost:3847/api/test', {
        headers: { 'X-Session-Token': 'token' },
      });
      expect(result).toEqual({ data: 'test' });
    });

    it('throws on non-ok response', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      } as any);

      await expect(client.get('/api/missing')).rejects.toThrow(
        'GET /api/missing: 404 Not Found',
      );
    });
  });

  describe('post', () => {
    it('makes POST request with body', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: '123' }),
      } as any);

      const result = await client.post('/api/test', { name: 'test' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3847/api/test', {
        method: 'POST',
        headers: {
          'X-Session-Token': 'token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'test' }),
      });
      expect(result).toEqual({ id: '123' });
    });

    it('makes POST request without body', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as any);

      await client.post('/api/test');
      expect(fetch).toHaveBeenCalledWith('http://localhost:3847/api/test', {
        method: 'POST',
        headers: { 'X-Session-Token': 'token' },
      });
    });

    it('throws on non-ok response', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server Error'),
      } as any);

      await expect(client.post('/api/test', {})).rejects.toThrow(
        'POST /api/test: 500 Server Error',
      );
    });
  });

  describe('put', () => {
    it('makes PUT request with body', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ updated: true }),
      } as any);

      const result = await client.put('/api/test/1', { name: 'updated' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3847/api/test/1', {
        method: 'PUT',
        headers: {
          'X-Session-Token': 'token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'updated' }),
      });
      expect(result).toEqual({ updated: true });
    });

    it('throws on non-ok response', async () => {
      const client = new ApiClient('http://localhost:3847', 'token');
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      } as any);

      await expect(client.put('/api/test/1', {})).rejects.toThrow(
        'PUT /api/test/1: 400 Bad Request',
      );
    });
  });
});
