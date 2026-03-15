import { describe, it, expect } from 'vitest';
import { buildInsightsPrompt } from '../prompt-builder.js';

describe('Insights PromptBuilder', () => {
  it('includes PR info', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'Add auth feature',
      branch: 'feat/auth',
      projectId: 'proj-1',
      transcriptPaths: [],
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
      transcriptPaths: [
        '/tmp/transcripts/sess-1.md',
        '/tmp/transcripts/sess-2.md',
      ],
    });
    expect(prompt).toContain('sess-1.md');
    expect(prompt).toContain('sess-2.md');
  });

  it('includes CLI command references', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      transcriptPaths: [],
    });
    expect(prompt).toContain('agent-shepherd insights get');
    expect(prompt).toContain('agent-shepherd insights update');
    expect(prompt).toContain('agent-shepherd insights history');
  });

  it('handles empty session logs gracefully', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'PR',
      branch: 'feat/x',
      projectId: 'proj-1',
      transcriptPaths: [],
    });
    expect(prompt).toContain('No session logs');
  });

  it('includes deduplication context when previousUpdatedAt is provided', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-1',
      prTitle: 'Test PR',
      branch: 'feat/test',
      projectId: 'proj-1',
      transcriptPaths: ['/tmp/session.md'],
      previousUpdatedAt: '2026-03-07T10:00:00Z',
    });

    expect(prompt).toContain('2026-03-07T10:00:00Z');
    expect(prompt).toContain('git log');
    expect(prompt).toContain('already been factored');
  });

  it('includes --pr flag in history command', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-123',
      prTitle: 'Test PR',
      branch: 'feat/test',
      projectId: 'proj-456',
      transcriptPaths: [],
    });

    expect(prompt).toContain(
      'agent-shepherd insights history proj-456 --pr pr-123',
    );
  });

  it('omits deduplication context when previousUpdatedAt is not provided', () => {
    const prompt = buildInsightsPrompt({
      prId: 'pr-1',
      prTitle: 'Test PR',
      branch: 'feat/test',
      projectId: 'proj-1',
      transcriptPaths: [],
    });

    expect(prompt).not.toContain('previous analysis');
  });
});
