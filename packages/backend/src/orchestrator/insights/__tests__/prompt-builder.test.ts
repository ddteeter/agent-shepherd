import { describe, it, expect } from 'vitest';
import { buildInsightsPrompt } from '../prompt-builder.js';

describe('Insights PromptBuilder', () => {
  it('includes PR info', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'Add auth feature',
      branch: 'feat/auth',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('pr-123');
    expect(prompt).toContain('Add auth feature');
    expect(prompt).toContain('feat/auth');
  });

  it('includes session log paths', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: ['/home/user/.claude/projects/x/sess-1.jsonl', '/home/user/.claude/projects/x/sess-2.jsonl'],
    });
    expect(prompt).toContain('sess-1.jsonl');
    expect(prompt).toContain('sess-2.jsonl');
  });

  it('includes CLI command references', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('shepherd insights get');
    expect(prompt).toContain('shepherd insights update');
    expect(prompt).toContain('shepherd insights history');
  });

  it('handles empty session logs gracefully', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      sessionLogPaths: [],
    });
    expect(prompt).toContain('No session logs');
  });
});
