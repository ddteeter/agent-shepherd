import { describe, it, expect, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('paths', () => {
  it('exports PACKAGE_ROOT, SKILLS_DIR, BACKEND_DIST, FRONTEND_DIST', async () => {
    const paths = await import('../paths.js');
    expect(paths.PACKAGE_ROOT).toBeDefined();
    expect(typeof paths.PACKAGE_ROOT).toBe('string');
    expect(paths.SKILLS_DIR).toContain('skills');
    expect(paths.BACKEND_DIST).toContain('packages/backend/dist');
    expect(paths.FRONTEND_DIST).toContain('packages/frontend/dist');
  });

  it('isDevelopmentMode returns true when .git exists', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(true);
    const { isDevelopmentMode } = await import('../paths.js');
    expect(isDevelopmentMode()).toBe(true);
  });

  it('isDevelopmentMode returns false when .git does not exist', async () => {
    const { existsSync } = await import('node:fs');
    vi.mocked(existsSync).mockReturnValue(false);
    const { isDevelopmentMode } = await import('../paths.js');
    expect(isDevelopmentMode()).toBe(false);
  });
});
