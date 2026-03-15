import { describe, it, expect } from 'vitest';
import { migrateCategories } from '../../db/data-migrations.js';

describe('migrateCategories', () => {
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

    const result = migrateCategories(input);
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

    const result = migrateCategories(input);
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

    const result = migrateCategories(input);
    expect(result.claudeMdRecommendations[0]).toEqual({
      title: 'Test',
      description: 'Desc',
      confidence: 'high',
      appliedPath: '.claude/rules/test.md',
    });
  });

  it('defaults toolRecommendations to empty array when missing', () => {
    const input = {
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateCategories(input);
    expect(result.toolRecommendations).toEqual([]);
  });

  it('passes through existing toolRecommendations unchanged', () => {
    const input = {
      toolRecommendations: [
        {
          title: 'Add sonarjs',
          description: 'Catches complexity',
          confidence: 'high',
          implementationPrompt: 'npm install eslint-plugin-sonarjs',
        },
      ],
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const result = migrateCategories(input);
    expect(result.toolRecommendations).toEqual([
      {
        title: 'Add sonarjs',
        description: 'Catches complexity',
        confidence: 'high',
        implementationPrompt: 'npm install eslint-plugin-sonarjs',
      },
    ]);
  });

  it('handles missing categories gracefully', () => {
    const result = migrateCategories(
      {} as unknown as Parameters<typeof migrateCategories>[0],
    );
    expect(result.claudeMdRecommendations).toEqual([]);
    expect(result.recurringPatterns).toEqual([]);
  });
});
