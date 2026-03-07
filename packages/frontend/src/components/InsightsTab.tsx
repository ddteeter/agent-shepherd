import { useState } from 'react';
import { AgentActivityPanel } from './AgentActivityPanel.js';
import type { ActivityEntry } from './AgentActivityPanel.js';

interface InsightItem {
  title: string;
  description: string;
  applied?: boolean;
}

interface RecurringPatternItem {
  title: string;
  description: string;
  prIds: string[];
}

interface InsightCategories {
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}

interface InsightsTabProps {
  insights: { categories: InsightCategories; branchRef: string | null; updatedAt: string } | null;
  hasComments: boolean;
  analyzerRunning: boolean;
  analyzerActivity: ActivityEntry[];
  onRunAnalyzer: () => void;
  onCancelAnalyzer: () => void;
}

function CategorySection({ title, items, renderItem }: {
  title: string;
  items: any[];
  renderItem: (item: any, i: number) => React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:opacity-80"
        style={{ color: 'var(--color-text)' }}
      >
        <span>{collapsed ? '▶' : '▼'}</span>
        <span>{title}</span>
        <span className="opacity-50">({items.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 ml-4">
          {items.map((item, i) => renderItem(item, i))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ item }: { item: InsightItem }) {
  return (
    <div
      className="p-3 rounded border text-sm"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))' }}
    >
      <div className="font-medium">{item.title}</div>
      <div className="mt-1 opacity-80">{item.description}</div>
      {item.applied !== undefined && (
        <span
          className="inline-block mt-2 text-xs px-2 py-0.5 rounded"
          style={{
            backgroundColor: item.applied ? 'rgba(46,160,67,0.15)' : 'rgba(130,130,130,0.1)',
            color: item.applied ? 'var(--color-success)' : 'var(--color-text)',
          }}
        >
          {item.applied ? 'Applied' : 'Pending'}
        </span>
      )}
    </div>
  );
}

export function InsightsTab({ insights, hasComments, analyzerRunning, analyzerActivity, onRunAnalyzer, onCancelAnalyzer }: InsightsTabProps) {
  // Analyzer running state
  if (analyzerRunning) {
    return (
      <div>
        <div className="flex items-center gap-2 text-sm px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span style={{ color: 'var(--color-warning, #d29922)' }}>Analyzer running...</span>
          <button
            onClick={onCancelAnalyzer}
            className="text-xs px-2 py-0.5 rounded border hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          >
            Cancel
          </button>
        </div>
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <AgentActivityPanel entries={analyzerActivity} />
        </div>
      </div>
    );
  }

  // Empty state — no comments yet
  if (!hasComments && !insights) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm opacity-70">
          Insights will be available after review comments are added.
          The analyzer examines agent session transcripts and comment history
          to recommend workflow improvements.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Run Analyzer button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Workflow Insights</h3>
        {hasComments && (
          <button
            onClick={onRunAnalyzer}
            className="text-xs px-3 py-1 rounded border hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-accent)' }}
          >
            Run Analyzer
          </button>
        )}
      </div>

      {/* No insights yet but has comments */}
      {!insights && (
        <p className="text-sm opacity-70">
          No insights yet. Click "Run Analyzer" to analyze agent behavior and comment patterns.
        </p>
      )}

      {/* Render insights categories */}
      {insights && (
        <div>
          {insights.branchRef && (
            <div
              className="mb-4 p-2 rounded text-xs"
              style={{ backgroundColor: 'rgba(130,80,223,0.1)' }}
            >
              File changes on branch: <code>{insights.branchRef}</code>
            </div>
          )}

          <CategorySection
            title="CLAUDE.md Recommendations"
            items={insights.categories.claudeMdRecommendations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Skill Recommendations"
            items={insights.categories.skillRecommendations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Prompt & Context Engineering"
            items={insights.categories.promptEngineering}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Agent Behavior Observations"
            items={insights.categories.agentBehaviorObservations}
            renderItem={(item, i) => <InsightCard key={i} item={item} />}
          />
          <CategorySection
            title="Recurring Patterns"
            items={insights.categories.recurringPatterns}
            renderItem={(item, i) => (
              <div key={i}>
                <InsightCard item={item} />
                {item.prIds.length > 0 && (
                  <div className="ml-3 mt-1 text-xs opacity-60">
                    Seen in {item.prIds.length} PR{item.prIds.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          />

          <div className="mt-4 text-xs opacity-50">
            Last updated: {new Date(insights.updatedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
