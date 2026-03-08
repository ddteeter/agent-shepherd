import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InsightsTab } from '../InsightsTab.js';

function makeInsights(overrides: any = {}) {
  return {
    categories: {
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
      ...overrides.categories,
    },
    branchRef: overrides.branchRef ?? null,
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
  };
}

describe('InsightsTab', () => {
  const defaultProps = {
    insights: null as any,
    hasComments: false,
    analyzerRunning: false,
    analyzerActivity: [] as any[],
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
          {
            title: 'Add lint rule',
            description: 'Consider adding ESLint rule',
            confidence: 'high',
          },
        ],
        skillRecommendations: [
          {
            title: 'Create skill',
            description: 'Create a test skill',
            confidence: 'medium',
          },
        ],
        promptEngineering: [],
        agentBehaviorObservations: [],
        recurringPatterns: [],
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
          {
            title: 'Rule',
            description: 'desc',
            confidence: 'high',
            appliedPath: 'CLAUDE.md',
          },
        ],
        skillRecommendations: [],
        promptEngineering: [],
        agentBehaviorObservations: [],
        recurringPatterns: [],
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
        claudeMdRecommendations: [],
        skillRecommendations: [],
        promptEngineering: [],
        agentBehaviorObservations: [],
        recurringPatterns: [
          {
            title: 'Pattern',
            description: 'desc',
            confidence: 'low',
            prIds: ['pr-1', 'pr-2'],
          },
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
          { title: 'Rule', description: 'desc', confidence: 'high' },
        ],
        skillRecommendations: [],
        promptEngineering: [],
        agentBehaviorObservations: [],
        recurringPatterns: [],
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
});
