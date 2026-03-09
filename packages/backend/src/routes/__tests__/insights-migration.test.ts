import { describe, it, expect } from 'vitest';
import { migrateInsightCategories } from '../insights.js';
describe('migrateInsightCategories', () => {
  it('converts applied: true to appliedPath: "CLAUDE.md"', () => {
    const input = {
      claudeMdRecommendations: [
        { title: 'Test', description: 'Desc', applied: true },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      confidence: 'medium',
      appliedPath: 'CLAUDE.md',
    });
    expect(result.claudeMdRecommendations[0]).not.toHaveProperty('applied');
  });

  it('removes applied: false without adding appliedPath', () => {
    const input = {
      claudeMdRecommendations: [
        { title: 'Test', description: 'Desc', applied: false },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      confidence: 'medium',
    });
  });

  it('passes through items with new format unchanged', () => {
    const input = {
      claudeMdRecommendations: [
        {
          title: 'Test',
          description: 'Desc',
          confidence: 'high',
          appliedPath: '.claude/rules/test.md',
        },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateInsightCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      confidence: 'high',
      appliedPath: '.claude/rules/test.md',
    });
  });

  it('handles missing categories gracefully', () => {
    const result = migrateInsightCategories(
      {} as unknown as Parameters<typeof migrateInsightCategories>[0],
    );
    expect(result.claudeMdRecommendations).toEqual([]);
    expect(result.recurringPatterns).toEqual([]);
  });
});
