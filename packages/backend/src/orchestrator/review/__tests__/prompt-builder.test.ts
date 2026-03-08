import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../prompt-builder.js';

describe('PromptBuilder', () => {
  it('includes comment summary with counts', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'Add feature',
      agentContext: '{"summary": "Added auth"}',
      commentSummary: {
        total: 5,
        bySeverity: { 'must-fix': 2, request: 2, suggestion: 1 },
        files: [
          {
            path: 'src/auth.ts',
            count: 3,
            bySeverity: { 'must-fix': 2, request: 1 },
          },
          { path: 'src/db.ts', count: 1, bySeverity: { suggestion: 1 } },
        ],
        generalCount: 1,
      },
    });

    expect(prompt).toContain('5 comments');
    expect(prompt).toContain('2 must-fix');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/db.ts');
  });

  it('includes agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: '{"summary": "Built the auth system"}',
      commentSummary: { total: 0, bySeverity: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('Built the auth system');
  });

  it('handles null agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: { total: 0, bySeverity: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('PR');
    expect(prompt).not.toContain('Context');
  });

  it('includes pull-based workflow instructions', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: {
        total: 3,
        bySeverity: { request: 3 },
        files: [{ path: 'src/a.ts', count: 3, bySeverity: { request: 3 } }],
        generalCount: 0,
      },
    });

    expect(prompt).toContain('agent-shepherd review');
    expect(prompt).toContain('--file');
    expect(prompt).toContain('agent-shepherd batch');
    expect(prompt).toContain('agent-shepherd ready');
  });

  it('does not include individual comment bodies', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      commentSummary: {
        total: 1,
        bySeverity: { 'must-fix': 1 },
        files: [
          { path: 'src/auth.ts', count: 1, bySeverity: { 'must-fix': 1 } },
        ],
        generalCount: 0,
      },
    });

    // The prompt should NOT contain individual comment markers — those come from CLI
    expect(prompt).not.toContain('comment ID:');
  });
});
