import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProgram = {
  name: vi.fn().mockReturnThis(),
  description: vi.fn().mockReturnThis(),
  version: vi.fn().mockReturnThis(),
  parse: vi.fn(),
};

vi.mock('commander', () => ({
  Command: class {
    name = mockProgram.name;
    description = mockProgram.description;
    version = mockProgram.version;
    parse = mockProgram.parse;
  },
}));

vi.mock('../api-client.js', () => ({
  ApiClient: class {
    constructor(public baseUrl: string) {}
  },
}));

vi.mock('../commands/init.js', () => ({ initCommand: vi.fn() }));
vi.mock('../commands/submit.js', () => ({ submitCommand: vi.fn() }));
vi.mock('../commands/batch.js', () => ({ batchCommand: vi.fn() }));
vi.mock('../commands/ready.js', () => ({ readyCommand: vi.fn() }));
vi.mock('../commands/status.js', () => ({ statusCommand: vi.fn() }));
vi.mock('../commands/list-projects.js', () => ({
  listProjectsCommand: vi.fn(),
}));
vi.mock('../commands/setup.js', () => ({ setupCommand: vi.fn() }));
vi.mock('../commands/start.js', () => ({ startCommand: vi.fn() }));
vi.mock('../commands/review.js', () => ({ reviewCommand: vi.fn() }));
vi.mock('../commands/insights.js', () => ({ insightsCommand: vi.fn() }));
vi.mock('../commands/resubmit.js', () => ({ resubmitCommand: vi.fn() }));
vi.mock('../commands/file-groups.js', () => ({ fileGroupsCommand: vi.fn() }));

describe('index', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all commands and calls parse', async () => {
    await import('../index.js');

    const { initCommand } = await import('../commands/init.js');
    const { submitCommand } = await import('../commands/submit.js');
    const { batchCommand } = await import('../commands/batch.js');
    const { readyCommand } = await import('../commands/ready.js');
    const { statusCommand } = await import('../commands/status.js');
    const { listProjectsCommand } =
      await import('../commands/list-projects.js');
    const { setupCommand } = await import('../commands/setup.js');
    const { startCommand } = await import('../commands/start.js');
    const { reviewCommand } = await import('../commands/review.js');
    const { insightsCommand } = await import('../commands/insights.js');
    const { resubmitCommand } = await import('../commands/resubmit.js');
    const { fileGroupsCommand } = await import('../commands/file-groups.js');

    expect(initCommand).toHaveBeenCalled();
    expect(submitCommand).toHaveBeenCalled();
    expect(batchCommand).toHaveBeenCalled();
    expect(readyCommand).toHaveBeenCalled();
    expect(statusCommand).toHaveBeenCalled();
    expect(listProjectsCommand).toHaveBeenCalled();
    expect(setupCommand).toHaveBeenCalled();
    expect(startCommand).toHaveBeenCalled();
    expect(reviewCommand).toHaveBeenCalled();
    expect(insightsCommand).toHaveBeenCalled();
    expect(resubmitCommand).toHaveBeenCalled();
    expect(fileGroupsCommand).toHaveBeenCalled();

    expect(mockProgram.name).toHaveBeenCalledWith('agent-shepherd');
    expect(mockProgram.parse).toHaveBeenCalled();
  });
});
