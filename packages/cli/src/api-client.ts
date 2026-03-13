import { readFileSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export class ApiClient {
  private cachedToken: string | undefined = undefined;

  constructor(
    private baseUrl: string,
    private tokenOverride?: string,
  ) {}

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  getToken(): string {
    if (this.tokenOverride) return this.tokenOverride;
    if (this.cachedToken) return this.cachedToken;
    try {
      this.cachedToken = readFileSync(
        path.join(homedir(), '.agent-shepherd', 'session-token'),
        'utf8',
      ).trim();
      return this.cachedToken;
    } catch {
      throw new Error(
        'Session token not found. Is the Agent Shepherd server running?',
      );
    }
  }

  authHeaders(): Record<string, string> {
    return { 'X-Session-Token': this.getToken() };
  }

  async get<T>(requestPath: string): Promise<T> {
    const response = await fetch(this.url(requestPath), {
      headers: this.authHeaders(),
    });
    if (!response.ok)
      throw new Error(
        `GET ${requestPath}: ${String(response.status)} ${await response.text()}`,
      );
    return response.json() as T;
  }

  async post<T>(requestPath: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = this.authHeaders();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(this.url(requestPath), {
      method: 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(
        `POST ${requestPath}: ${String(response.status)} ${await response.text()}`,
      );
    return response.json() as T;
  }

  async put<T>(requestPath: string, body: unknown): Promise<T> {
    const response = await fetch(this.url(requestPath), {
      method: 'PUT',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        `PUT ${requestPath}: ${String(response.status)} ${await response.text()}`,
      );
    return response.json() as T;
  }
}
