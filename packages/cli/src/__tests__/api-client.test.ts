import { describe, it, expect } from 'vitest';
import { ApiClient } from '../api-client.js';

describe('ApiClient', () => {
  it('constructs URLs correctly', () => {
    const client = new ApiClient('http://localhost:3847');
    expect((client as any).url('/api/projects')).toBe('http://localhost:3847/api/projects');
  });
});
