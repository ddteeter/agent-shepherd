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
        byType: { 'must-fix': 2, request: 2, suggestion: 1 },
        files: [
          {
            path: 'src/auth.ts',
            count: 3,
            byType: { 'must-fix': 2, request: 1 },
          },
          { path: 'src/db.ts', count: 1, byType: { suggestion: 1 } },
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
      commentSummary: { total: 0, byType: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('Built the auth system');
  });

  it('handles undefined agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: undefined,
      commentSummary: { total: 0, byType: {}, files: [], generalCount: 0 },
    });
    expect(prompt).toContain('PR');
    expect(prompt).not.toContain('Context');
  });

  it('includes pull-based workflow instructions', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: undefined,
      commentSummary: {
        total: 3,
        byType: { request: 3 },
        files: [{ path: 'src/a.ts', count: 3, byType: { request: 3 } }],
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
      agentContext: undefined,
      commentSummary: {
        total: 1,
        byType: { 'must-fix': 1 },
        files: [{ path: 'src/auth.ts', count: 1, byType: { 'must-fix': 1 } }],
        generalCount: 0,
      },
    });

    expect(prompt).not.toContain('comment ID:');
  });

  it('uses "Comment Types" heading not "Severity Levels"', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: undefined,
      commentSummary: { total: 0, byType: {}, files: [], generalCount: 0 },
    });

    expect(prompt).toContain('## Comment Types and How to Handle Them');
    expect(prompt).not.toContain('## Severity Levels and How to Handle Them');
  });

  it('includes question type section', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: undefined,
      commentSummary: { total: 0, byType: {}, files: [], generalCount: 0 },
    });

    expect(prompt).toContain('### `question`');
  });

  it('instructs agent to use Write tool for batch JSON instead of echo', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: undefined,
      commentSummary: {
        total: 1,
        byType: { request: 1 },
        files: [{ path: 'src/a.ts', count: 1, byType: { request: 1 } }],
        generalCount: 0,
      },
    });

    expect(prompt).toContain('Write tool');
    expect(prompt).toContain('agent-shepherd-batch.json');
    expect(prompt).toContain('--file /tmp/agent-shepherd-batch.json');
    expect(prompt).not.toContain("echo '");
  });
});
