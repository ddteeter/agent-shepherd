import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class ApiClient {
  private cachedToken: string | null = null;

  constructor(
    private baseUrl: string,
    private tokenOverride?: string,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private getToken(): string {
    if (this.tokenOverride) return this.tokenOverride;
    if (this.cachedToken) return this.cachedToken;
    try {
      this.cachedToken = readFileSync(
        join(homedir(), '.agent-shepherd', 'session-token'),
        'utf-8',
      ).trim();
      return this.cachedToken;
    } catch {
      throw new Error(
        'Session token not found. Is the Agent Shepherd server running?',
      );
    }
  }

  private authHeaders(): Record<string, string> {
    return { 'X-Session-Token': this.getToken() };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), {
      headers: this.authHeaders(),
    });
    if (!res.ok)
      throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = this.authHeaders();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!res.ok)
      throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }
}
