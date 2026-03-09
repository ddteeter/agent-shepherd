import { describe, it, expect, afterEach } from 'vitest';
import { getSessionToken } from '../session-token.js';

describe('getSessionToken', () => {
  const globalRecord = globalThis as Record<string, unknown>;
  const original = globalRecord.__SHEPHERD_TOKEN__;

  afterEach(() => {
    if (original === undefined) {
      delete globalRecord.__SHEPHERD_TOKEN__;
    } else {
      globalRecord.__SHEPHERD_TOKEN__ = original;
    }
  });

  it('returns the token when set', () => {
    globalRecord.__SHEPHERD_TOKEN__ = 'test-token-123';
    expect(getSessionToken()).toBe('test-token-123');
  });

  it('throws when token is not set', () => {
    delete globalRecord.__SHEPHERD_TOKEN__;
    expect(() => getSessionToken()).toThrow('Session token not found');
  });

  it('throws when token is empty string', () => {
    globalRecord.__SHEPHERD_TOKEN__ = '';
    expect(() => getSessionToken()).toThrow('Session token not found');
  });
});
