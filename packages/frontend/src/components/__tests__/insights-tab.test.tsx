import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InsightsTab } from '../insights-tab.js';
import type { ActivityEntry } from '../agent-activity-panel.js';

import type {
  InsightItem,
  RecurringPatternItem,
  ToolRecommendationItem,
  InsightCategories,
} from '@agent-shepherd/shared';

interface InsightsData {
  categories: InsightCategories;
  branchRef: string | undefined;
  updatedAt: string;
  previousUpdatedAt: string | null | undefined;
}

const defaultFirstSeenAt = '2026-01-01T00:00:00Z';

function makeInsightItem(
  overrides: Partial<InsightItem> &
    Pick<InsightItem, 'title' | 'description' | 'confidence'>,
): InsightItem {
  return { firstSeenAt: defaultFirstSeenAt, ...overrides };
}

function makeRecurringPatternItem(
  overrides: Partial<RecurringPatternItem> &
    Pick<
      RecurringPatternItem,
      'title' | 'description' | 'confidence' | 'prIds'
    >,
): RecurringPatternItem {
  return { firstSeenAt: defaultFirstSeenAt, ...overrides };
}

function makeToolRecommendationItem(
  overrides: Partial<ToolRecommendationItem> &
    Pick<
      ToolRecommendationItem,
      'title' | 'description' | 'confidence' | 'implementationPrompt'
    >,
): ToolRecommendationItem {
  return { firstSeenAt: defaultFirstSeenAt, ...overrides };
}

function makeInsights(
  overrides: Omit<Partial<InsightsData>, 'categories'> & {
    categories?: Partial<InsightCategories>;
  } = {},
): InsightsData {
  return {
    categories: {
      toolRecommendations: [],
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
      ...overrides.categories,
    },
    branchRef: overrides.branchRef,
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
    previousUpdatedAt: overrides.previousUpdatedAt,
  };
}

describe('InsightsTab', () => {
  const defaultProps = {
    insights: undefined as InsightsData | undefined,
    hasComments: false,
    analyzerRunning: false,
    analyzerActivity: [] as ActivityEntry[],
    onCancelAnalyzer: vi.fn(),
  };

  it('shows empty state when no comments and no insights', () => {
    render(<InsightsTab {...defaultProps} />);
    expect(screen.getByText(/Insights will be available/)).toBeInTheDocument();
  });

  it('shows "no insights yet" when has comments but no insights', () => {
    render(<InsightsTab {...defaultProps} hasComments={true} />);
    expect(screen.getByText(/No insights yet/)).toBeInTheDocument();
  });

  it('shows analyzer running status', () => {
    render(
      <InsightsTab
        {...defaultProps}
        hasComments={true}
        analyzerRunning={true}
      />,
    );
    expect(screen.getByText('Analyzer running...')).toBeInTheDocument();
  });

  it('renders insights categories when insights exist', () => {
    const insights = makeInsights({
      categories: {
        claudeMdRecommendations: [
          makeInsightItem({
            title: 'Add lint rule',
            description: 'Consider adding ESLint rule',
            confidence: 'high',
          }),
        ],
        skillRecommendations: [
          makeInsightItem({
            title: 'Create skill',
            description: 'Create a test skill',
            confidence: 'medium',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('Add lint rule')).toBeInTheDocument();
    expect(screen.getByText('Create skill')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('renders branch reference when present', () => {
    const insights = makeInsights({ branchRef: 'feat/my-feature' });
    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('feat/my-feature')).toBeInTheDocument();
  });

  it('renders applied path on insight cards', () => {
    const insights = makeInsights({
      categories: {
        claudeMdRecommendations: [
          makeInsightItem({
            title: 'Rule',
            description: 'desc',
            confidence: 'high',
            appliedPath: 'CLAUDE.md',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('CLAUDE.md')).toBeInTheDocument();
  });

  it('renders recurring patterns with PR count', () => {
    const insights = makeInsights({
      categories: {
        recurringPatterns: [
          makeRecurringPatternItem({
            title: 'Pattern',
            description: 'desc',
            confidence: 'low',
            prIds: ['pr-1', 'pr-2'],
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('Pattern')).toBeInTheDocument();
    expect(screen.getByText(/Seen in 2 PRs/)).toBeInTheDocument();
  });

  it('collapses a category section on click', async () => {
    const user = userEvent.setup();
    const insights = makeInsights({
      categories: {
        claudeMdRecommendations: [
          makeInsightItem({
            title: 'Rule',
            description: 'desc',
            confidence: 'high',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('Rule')).toBeInTheDocument();

    const sectionButton = screen.getByText('CLAUDE.md Recommendations');
    await user.click(sectionButton);

    expect(screen.queryByText('Rule')).not.toBeInTheDocument();
  });

  it('shows updated timestamp', () => {
    const insights = makeInsights({ updatedAt: '2026-06-15T10:30:00Z' });
    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it('renders tool recommendations as the first category', () => {
    const insights = makeInsights({
      categories: {
        toolRecommendations: [
          makeToolRecommendationItem({
            title: 'Add sonarjs plugin',
            description: 'Catches cognitive complexity issues',
            confidence: 'high',
            implementationPrompt: 'npm install eslint-plugin-sonarjs',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );
    expect(screen.getByText('Add sonarjs plugin')).toBeInTheDocument();
    expect(
      screen.getByText('Catches cognitive complexity issues'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tool & Guardrail Recommendations'),
    ).toBeInTheDocument();
  });

  it('shows implementation prompt when expanded', async () => {
    const user = userEvent.setup();
    const insights = makeInsights({
      categories: {
        toolRecommendations: [
          makeToolRecommendationItem({
            title: 'Add sonarjs',
            description: 'desc',
            confidence: 'high',
            implementationPrompt: 'npm install eslint-plugin-sonarjs',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );

    expect(
      screen.queryByText('npm install eslint-plugin-sonarjs'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('Implementation'));
    expect(
      screen.getByText('npm install eslint-plugin-sonarjs'),
    ).toBeInTheDocument();
  });

  it('copies implementation prompt to clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const insights = makeInsights({
      categories: {
        toolRecommendations: [
          makeToolRecommendationItem({
            title: 'Add tool',
            description: 'desc',
            confidence: 'high',
            implementationPrompt: 'npm install some-tool',
          }),
        ],
      },
    });

    render(
      <InsightsTab {...defaultProps} hasComments={true} insights={insights} />,
    );

    await user.click(screen.getByText('Implementation'));
    await user.click(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalledWith('npm install some-tool');
  });
});
