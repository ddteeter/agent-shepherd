export class ApiClient {
  constructor(private baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path}: ${res.status} ${await res.text()}`);
    return res.json() as T;
  }
}
