import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const TOKEN_FILENAME = 'session-token';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeSessionToken(dataDirectory: string, token: string): void {
  writeFileSync(path.join(dataDirectory, TOKEN_FILENAME), token, {
    mode: 0o600,
  });
}

export function readSessionToken(dataDirectory: string): string {
  return readFileSync(path.join(dataDirectory, TOKEN_FILENAME), 'utf8').trim();
}

export function deleteSessionToken(dataDirectory: string): void {
  try {
    unlinkSync(path.join(dataDirectory, TOKEN_FILENAME));
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT')
      throw error;
  }
}
