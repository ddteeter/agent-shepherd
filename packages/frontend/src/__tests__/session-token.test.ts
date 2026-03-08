import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSessionToken } from '../session-token.js';

describe('getSessionToken', () => {
  const original = (window as any).__SHEPHERD_TOKEN__;

  afterEach(() => {
    if (original !== undefined) {
      (window as any).__SHEPHERD_TOKEN__ = original;
    } else {
      delete (window as any).__SHEPHERD_TOKEN__;
    }
  });

  it('returns the token when set', () => {
    (window as any).__SHEPHERD_TOKEN__ = 'test-token-123';
    expect(getSessionToken()).toBe('test-token-123');
  });

  it('throws when token is not set', () => {
    delete (window as any).__SHEPHERD_TOKEN__;
    expect(() => getSessionToken()).toThrow('Session token not found');
  });

  it('throws when token is empty string', () => {
    (window as any).__SHEPHERD_TOKEN__ = '';
    expect(() => getSessionToken()).toThrow('Session token not found');
  });
});
