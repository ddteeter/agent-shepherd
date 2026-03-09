import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateSessionToken,
  writeSessionToken,
  readSessionToken,
  deleteSessionToken,
} from '../session-token.js';

describe('session-token', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'shepherd-token-test-'),
    );
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('generates a 64-char hex token', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });

  it('writes and reads a token', () => {
    writeSessionToken(temporaryDirectory, 'test-token-123');
    const result = readSessionToken(temporaryDirectory);
    expect(result).toBe('test-token-123');
  });

  it('deletes a token file', () => {
    writeSessionToken(temporaryDirectory, 'to-delete');
    deleteSessionToken(temporaryDirectory);
    expect(existsSync(path.join(temporaryDirectory, 'session-token'))).toBe(
      false,
    );
  });

  it('delete ignores missing file', () => {
    expect(() => {
      deleteSessionToken(temporaryDirectory);
    }).not.toThrow();
  });
});
