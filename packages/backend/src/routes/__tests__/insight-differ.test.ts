import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { diffInsightCategories } from '../insight-differ.js';
import type {
  InsightCategories,
  InsightItem,
  RecurringPatternItem,
  ToolRecommendationItem,
} from '@agent-shepherd/shared';

const NOW = '2026-03-15T12:00:00.000Z';
const EARLIER = '2026-01-01T00:00:00.000Z';
const EVEN_EARLIER = '2025-06-01T00:00:00.000Z';

function emptyCategories(): InsightCategories {
  return {
    toolRecommendations: [],
    claudeMdRecommendations: [],
    skillRecommendations: [],
    promptEngineering: [],
    agentBehaviorObservations: [],
    recurringPatterns: [],
  };
}

function makeWithDefaults<
  T extends { confidence: string; firstSeenAt: string },
>(overrides: Partial<T>): T {
  return { confidence: 'medium', firstSeenAt: NOW, ...overrides } as T;
}

function makeInsightItem(
  overrides: Partial<InsightItem> & { title: string; description: string },
): InsightItem {
  return makeWithDefaults<InsightItem>(overrides);
}

function makeRecurringPatternItem(
  overrides: Partial<RecurringPatternItem> & {
    title: string;
    description: string;
    prIds: string[];
  },
): RecurringPatternItem {
  return makeWithDefaults<RecurringPatternItem>(overrides);
}

function makeToolRecommendationItem(
  overrides: Partial<ToolRecommendationItem> & {
    title: string;
    description: string;
    implementationPrompt: string;
  },
): ToolRecommendationItem {
  return makeWithDefaults<ToolRecommendationItem>(overrides);
}

describe('diffInsightCategories', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('first run (no existing)', () => {
    it('stamps firstSeenAt=now on all new InsightItems', () => {
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Use strict',
            description: 'Enable strict mode',
            confidence: 'high',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(NOW);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBeUndefined();
    });

    it('stamps firstSeenAt=now on new ToolRecommendationItems', () => {
      const incoming: InsightCategories = {
        ...emptyCategories(),
        toolRecommendations: [
          {
            title: 'Add ESLint',
            description: 'Linting helps',
            confidence: 'high',
            implementationPrompt: 'npm install eslint',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      expect(result.toolRecommendations[0].firstSeenAt).toBe(NOW);
      expect(result.toolRecommendations[0].lastUpdatedAt).toBeUndefined();
    });

    it('stamps firstSeenAt=now on new RecurringPatternItems', () => {
      const incoming: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          {
            title: 'Missing tests',
            description: 'Tests often missing',
            confidence: 'low',
            prIds: ['pr-1'],
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      expect(result.recurringPatterns[0].firstSeenAt).toBe(NOW);
      expect(result.recurringPatterns[0].lastUpdatedAt).toBeUndefined();
    });

    it('processes all categories on first run', () => {
      const incoming: InsightCategories = {
        toolRecommendations: [
          makeToolRecommendationItem({
            title: 'T1',
            description: 'D1',
            implementationPrompt: 'P1',
          }),
        ],
        claudeMdRecommendations: [
          makeInsightItem({ title: 'C1', description: 'D1' }),
        ],
        skillRecommendations: [
          makeInsightItem({ title: 'S1', description: 'D1' }),
        ],
        promptEngineering: [
          makeInsightItem({ title: 'PE1', description: 'D1' }),
        ],
        agentBehaviorObservations: [
          makeInsightItem({ title: 'A1', description: 'D1' }),
        ],
        recurringPatterns: [
          makeRecurringPatternItem({
            title: 'R1',
            description: 'D1',
            prIds: ['pr-1'],
          }),
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      for (const item of result.toolRecommendations) {
        expect(item.firstSeenAt).toBe(NOW);
      }
      for (const item of result.claudeMdRecommendations) {
        expect(item.firstSeenAt).toBe(NOW);
      }
      for (const item of result.skillRecommendations) {
        expect(item.firstSeenAt).toBe(NOW);
      }
      for (const item of result.promptEngineering) {
        expect(item.firstSeenAt).toBe(NOW);
      }
      for (const item of result.agentBehaviorObservations) {
        expect(item.firstSeenAt).toBe(NOW);
      }
      for (const item of result.recurringPatterns) {
        expect(item.firstSeenAt).toBe(NOW);
      }
    });
  });

  describe('unchanged items', () => {
    it('preserves firstSeenAt and has no lastUpdatedAt when content is identical', () => {
      const existingItem = makeInsightItem({
        title: 'Use strict',
        description: 'Enable strict mode',
        confidence: 'high',
        firstSeenAt: EARLIER,
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Use strict',
            description: 'Enable strict mode',
            confidence: 'high',
            firstSeenAt: NOW,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBeUndefined();
    });

    it('preserves existing lastUpdatedAt when content remains unchanged after a previous update', () => {
      const existingItem = makeInsightItem({
        title: 'Use strict',
        description: 'Enable strict mode',
        confidence: 'high',
        firstSeenAt: EVEN_EARLIER,
        lastUpdatedAt: EARLIER,
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Use strict',
            description: 'Enable strict mode',
            confidence: 'high',
            firstSeenAt: NOW,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EVEN_EARLIER);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(EARLIER);
    });
  });

  describe('updated items', () => {
    it('preserves firstSeenAt and stamps lastUpdatedAt when description changes', () => {
      const existingItem = makeInsightItem({
        title: 'Use strict',
        description: 'Old description',
        confidence: 'high',
        firstSeenAt: EARLIER,
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Use strict',
            description: 'New description',
            confidence: 'high',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(NOW);
    });

    it('preserves firstSeenAt and stamps lastUpdatedAt when confidence changes', () => {
      const existingItem = makeInsightItem({
        title: 'Use strict',
        description: 'Same',
        confidence: 'low',
        firstSeenAt: EARLIER,
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Use strict',
            description: 'Same',
            confidence: 'high',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(NOW);
    });

    it('preserves firstSeenAt and stamps lastUpdatedAt when appliedPath changes', () => {
      const existingItem = makeInsightItem({
        title: 'Rule',
        description: 'Same',
        confidence: 'medium',
        firstSeenAt: EARLIER,
        appliedPath: 'CLAUDE.md',
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Rule',
            description: 'Same',
            confidence: 'medium',
            appliedPath: '.claude/rules/new.md',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.claudeMdRecommendations[0].lastUpdatedAt).toBe(NOW);
    });

    it('stamps lastUpdatedAt when implementationPrompt changes on ToolRecommendationItem', () => {
      const existingItem = makeToolRecommendationItem({
        title: 'Add ESLint',
        description: 'Linting',
        implementationPrompt: 'npm install eslint',
        firstSeenAt: EARLIER,
      });
      const existing: InsightCategories = {
        ...emptyCategories(),
        toolRecommendations: [existingItem],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        toolRecommendations: [
          {
            title: 'Add ESLint',
            description: 'Linting',
            confidence: 'medium',
            implementationPrompt: 'npm install eslint --save-dev',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.toolRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.toolRecommendations[0].lastUpdatedAt).toBe(NOW);
    });
  });

  describe('strip agent-provided timestamps', () => {
    it('ignores agent-provided firstSeenAt on new items and uses now instead', () => {
      const incoming: InsightCategories = {
        ...emptyCategories(),
        skillRecommendations: [
          {
            title: 'New Skill',
            description: 'Desc',
            confidence: 'medium',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      expect(result.skillRecommendations[0].firstSeenAt).toBe(NOW);
    });

    it('ignores agent-provided lastUpdatedAt on new items', () => {
      const incoming: InsightCategories = {
        ...emptyCategories(),
        skillRecommendations: [
          {
            title: 'New Skill',
            description: 'Desc',
            confidence: 'medium',
            firstSeenAt: EARLIER,
            lastUpdatedAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, undefined);

      expect(result.skillRecommendations[0].lastUpdatedAt).toBeUndefined();
    });

    it('ignores agent-provided firstSeenAt on matched unchanged items', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        promptEngineering: [
          makeInsightItem({
            title: 'Chain prompts',
            description: 'Use chaining',
            confidence: 'high',
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        promptEngineering: [
          {
            title: 'Chain prompts',
            description: 'Use chaining',
            confidence: 'high',
            firstSeenAt: NOW,
            lastUpdatedAt: EVEN_EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.promptEngineering[0].firstSeenAt).toBe(EARLIER);
      expect(result.promptEngineering[0].lastUpdatedAt).toBeUndefined();
    });
  });

  describe('per-category title matching', () => {
    it('tracks same title independently across different categories', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          makeInsightItem({
            title: 'Shared Title',
            description: 'Desc in claudeMd',
            confidence: 'high',
            firstSeenAt: EARLIER,
          }),
        ],
        skillRecommendations: [
          makeInsightItem({
            title: 'Shared Title',
            description: 'Desc in skill',
            confidence: 'medium',
            firstSeenAt: EVEN_EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          {
            title: 'Shared Title',
            description: 'Desc in claudeMd',
            confidence: 'high',
            firstSeenAt: NOW,
          },
        ],
        skillRecommendations: [
          {
            title: 'Shared Title',
            description: 'Desc in skill',
            confidence: 'medium',
            firstSeenAt: NOW,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.claudeMdRecommendations[0].firstSeenAt).toBe(EARLIER);
      expect(result.skillRecommendations[0].firstSeenAt).toBe(EVEN_EARLIER);
    });

    it('treats an item as new if title not found in same category even if found in another', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        claudeMdRecommendations: [
          makeInsightItem({
            title: 'Cross Cat',
            description: 'Desc',
            confidence: 'high',
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        skillRecommendations: [
          {
            title: 'Cross Cat',
            description: 'Desc',
            confidence: 'high',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.skillRecommendations[0].firstSeenAt).toBe(NOW);
    });
  });

  describe('duplicate titles within a category', () => {
    it('only the first incoming item matches the existing; subsequent duplicates are treated as new', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        agentBehaviorObservations: [
          makeInsightItem({
            title: 'Dup Title',
            description: 'Original',
            confidence: 'high',
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        agentBehaviorObservations: [
          {
            title: 'Dup Title',
            description: 'Original',
            confidence: 'high',
            firstSeenAt: EARLIER,
          },
          {
            title: 'Dup Title',
            description: 'Duplicate',
            confidence: 'medium',
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      // First match: unchanged, preserves firstSeenAt
      expect(result.agentBehaviorObservations[0].firstSeenAt).toBe(EARLIER);
      expect(result.agentBehaviorObservations[0].lastUpdatedAt).toBeUndefined();

      // Second: treated as new
      expect(result.agentBehaviorObservations[1].firstSeenAt).toBe(NOW);
      expect(result.agentBehaviorObservations[1].lastUpdatedAt).toBeUndefined();
    });
  });

  describe('RecurringPatternItem prIds comparison', () => {
    it('treats same prIds in different order as unchanged', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          makeRecurringPatternItem({
            title: 'Pattern',
            description: 'Desc',
            prIds: ['pr-1', 'pr-2'],
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          {
            title: 'Pattern',
            description: 'Desc',
            confidence: 'medium',
            prIds: ['pr-2', 'pr-1'],
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.recurringPatterns[0].firstSeenAt).toBe(EARLIER);
      expect(result.recurringPatterns[0].lastUpdatedAt).toBeUndefined();
    });

    it('stamps lastUpdatedAt when a new prId is added', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          makeRecurringPatternItem({
            title: 'Pattern',
            description: 'Desc',
            prIds: ['pr-1'],
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          {
            title: 'Pattern',
            description: 'Desc',
            confidence: 'medium',
            prIds: ['pr-1', 'pr-2'],
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.recurringPatterns[0].firstSeenAt).toBe(EARLIER);
      expect(result.recurringPatterns[0].lastUpdatedAt).toBe(NOW);
    });

    it('stamps lastUpdatedAt when a prId is removed', () => {
      const existing: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          makeRecurringPatternItem({
            title: 'Pattern',
            description: 'Desc',
            prIds: ['pr-1', 'pr-2'],
            firstSeenAt: EARLIER,
          }),
        ],
      };
      const incoming: InsightCategories = {
        ...emptyCategories(),
        recurringPatterns: [
          {
            title: 'Pattern',
            description: 'Desc',
            confidence: 'medium',
            prIds: ['pr-1'],
            firstSeenAt: EARLIER,
          },
        ],
      };

      const result = diffInsightCategories(incoming, existing);

      expect(result.recurringPatterns[0].firstSeenAt).toBe(EARLIER);
      expect(result.recurringPatterns[0].lastUpdatedAt).toBe(NOW);
    });
  });
});
