export function getSessionToken(): string {
  const token = (globalThis as Record<string, unknown>).__SHEPHERD_TOKEN__ as
    | string
    | undefined;
  if (!token)
    throw new Error('Session token not found. Is the server running?');
  return token;
}
