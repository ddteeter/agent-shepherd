export function getSessionToken(): string {
  const token = (globalThis as any).__SHEPHERD_TOKEN__;
  if (!token)
    throw new Error('Session token not found. Is the server running?');
  return token;
}
