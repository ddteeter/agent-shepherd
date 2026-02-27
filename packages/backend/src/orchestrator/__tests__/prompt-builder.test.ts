import { describe, it, expect } from 'vitest';
import { buildReviewPrompt } from '../prompt-builder.js';

describe('PromptBuilder', () => {
  it('groups comments by file', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'Add feature',
      agentContext: '{"summary": "Added auth"}',
      comments: [
        { filePath: 'src/auth.ts', startLine: 10, endLine: 10, body: 'Fix this', severity: 'must-fix', id: '1', thread: [] },
        { filePath: 'src/auth.ts', startLine: 20, endLine: 22, body: 'Consider refactoring', severity: 'suggestion', id: '2', thread: [] },
        { filePath: 'src/index.ts', startLine: 5, endLine: 5, body: 'Update import', severity: 'request', id: '3', thread: [] },
      ],
    });

    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('MUST FIX');
    expect(prompt).toContain('Fix this');
  });

  it('includes agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: '{"summary": "Built the auth system"}',
      comments: [],
    });
    expect(prompt).toContain('Built the auth system');
  });

  it('handles null agent context', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      comments: [],
    });
    expect(prompt).toContain('PR');
    expect(prompt).not.toContain('Context');
  });

  it('includes thread history', () => {
    const prompt = buildReviewPrompt({
      prId: 'test-pr-id',
      prTitle: 'PR',
      agentContext: null,
      comments: [
        {
          filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'Fix this', severity: 'request', id: '1',
          thread: [
            { author: 'agent', body: 'I disagree because...' },
            { author: 'human', body: 'OK but still fix it' },
          ],
        },
      ],
    });
    expect(prompt).toContain('I disagree because');
    expect(prompt).toContain('OK but still fix it');
  });
});
