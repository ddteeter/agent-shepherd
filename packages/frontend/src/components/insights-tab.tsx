import { useState } from 'react';
import type { ActivityEntry } from './agent-activity-panel.js';
import { AgentStatusSection } from './agent-status-section.js';

type InsightConfidence = 'high' | 'medium' | 'low';

interface InsightItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  appliedPath?: string;
}

interface RecurringPatternItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  prIds: string[];
}

interface ToolRecommendationItem {
  title: string;
  description: string;
  confidence: InsightConfidence;
  implementationPrompt: string;
}

interface InsightCategories {
  toolRecommendations: ToolRecommendationItem[];
  claudeMdRecommendations: InsightItem[];
  skillRecommendations: InsightItem[];
  promptEngineering: InsightItem[];
  agentBehaviorObservations: InsightItem[];
  recurringPatterns: RecurringPatternItem[];
}

interface InsightsTabProperties {
  insights:
    | {
        categories: InsightCategories;
        branchRef: string | undefined;
        updatedAt: string;
      }
    | undefined;
  hasComments: boolean;
  analyzerRunning: boolean;
  analyzerActivity: ActivityEntry[];
  onCancelAnalyzer: () => void;
}

function CategorySection<T>({
  title,
  items,
  renderItem,
}: Readonly<{
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
}>) {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return;

  return (
    <div className="mb-4">
      <button
        onClick={() => {
          setCollapsed(!collapsed);
        }}
        className="flex items-center gap-2 text-sm font-medium mb-2 hover:opacity-80"
        style={{ color: 'var(--color-text)' }}
      >
        <span>{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span>{title}</span>
        <span className="opacity-50">({items.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 ml-4">
          {items.map((item, index) => renderItem(item, index))}
        </div>
      )}
    </div>
  );
}

const confidenceColors: Record<
  InsightConfidence,
  { bg: string; text: string; label: string }
> = {
  high: {
    bg: 'rgba(46,160,67,0.15)',
    text: 'var(--color-success, #3fb950)',
    label: 'High',
  },
  medium: {
    bg: 'rgba(210,153,34,0.15)',
    text: 'var(--color-warning, #d29922)',
    label: 'Medium',
  },
  low: {
    bg: 'rgba(130,130,130,0.15)',
    text: 'var(--color-text)',
    label: 'Low',
  },
};

function InsightCard({ item }: Readonly<{ item: InsightItem }>) {
  const config = confidenceColors[item.confidence];
  return (
    <div
      className="p-3 rounded border text-sm"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))',
      }}
    >
      <div className="font-medium flex items-center gap-2">
        {item.title}
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: config.bg, color: config.text }}
        >
          {config.label}
        </span>
      </div>
      <div className="mt-1 opacity-80">{item.description}</div>
      {item.appliedPath && (
        <div className="mt-2 text-xs opacity-70">
          Applied to{' '}
          <code
            className="px-1 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(130,130,130,0.15)' }}
          >
            {item.appliedPath}
          </code>
        </div>
      )}
    </div>
  );
}

function ToolRecommendationCard({
  item,
}: Readonly<{ item: ToolRecommendationItem }>) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = confidenceColors[item.confidence];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(item.implementationPrompt);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div
      className="p-3 rounded border text-sm"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary, rgba(130,130,130,0.05))',
      }}
    >
      <div className="font-medium flex items-center gap-2">
        {item.title}
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: config.bg, color: config.text }}
        >
          {config.label}
        </span>
      </div>
      <div className="mt-1 opacity-80">{item.description}</div>
      <div className="mt-2">
        <button
          onClick={() => {
            setExpanded(!expanded);
          }}
          className="text-xs flex items-center gap-1 hover:opacity-80"
          style={{ color: 'var(--color-accent, #58a6ff)' }}
        >
          <span>{expanded ? '\u25BC' : '\u25B6'}</span>
          <span>Implementation</span>
        </button>
        {expanded && (
          <div className="mt-2 relative">
            <button
              onClick={() => {
                void handleCopy();
              }}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded hover:opacity-80"
              style={{
                backgroundColor:
                  'var(--color-bg-tertiary, rgba(130,130,130,0.2))',
                color: 'var(--color-text)',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <pre
              className="p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap"
              style={{
                backgroundColor:
                  'var(--color-bg-tertiary, rgba(130,130,130,0.1))',
              }}
            >
              {item.implementationPrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function InsightsTab({
  insights,
  hasComments,
  analyzerRunning,
  analyzerActivity,
  onCancelAnalyzer,
}: Readonly<InsightsTabProperties>) {
  if (!hasComments && !insights && !analyzerRunning) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm opacity-70">
          Insights will be available after review comments are added. The
          analyzer examines agent session transcripts and comment history to
          recommend workflow improvements.
        </p>
      </div>
    );
  }

  return (
    <div>
      <AgentStatusSection
        active={analyzerRunning}
        activity={analyzerActivity}
        onCancel={onCancelAnalyzer}
        label="Analyzer running..."
      />

      <div className="px-4 py-4">
        <div className="mb-4">
          <h3 className="text-sm font-medium">Workflow Insights</h3>
        </div>

        {!insights && (
          <p className="text-sm opacity-70">
            No insights yet. Use the &quot;Run Analyzer&quot; button below to
            analyze agent behavior and comment patterns.
          </p>
        )}

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
              title="Tool & Guardrail Recommendations"
              items={insights.categories.toolRecommendations}
              renderItem={(item: ToolRecommendationItem, index: number) => (
                <ToolRecommendationCard key={index} item={item} />
              )}
            />
            <CategorySection
              title="CLAUDE.md Recommendations"
              items={insights.categories.claudeMdRecommendations}
              renderItem={(item: InsightItem, index: number) => (
                <InsightCard key={index} item={item} />
              )}
            />
            <CategorySection
              title="Skill Recommendations"
              items={insights.categories.skillRecommendations}
              renderItem={(item: InsightItem, index: number) => (
                <InsightCard key={index} item={item} />
              )}
            />
            <CategorySection
              title="Prompt & Context Engineering"
              items={insights.categories.promptEngineering}
              renderItem={(item: InsightItem, index: number) => (
                <InsightCard key={index} item={item} />
              )}
            />
            <CategorySection
              title="Agent Behavior Observations"
              items={insights.categories.agentBehaviorObservations}
              renderItem={(item: InsightItem, index: number) => (
                <InsightCard key={index} item={item} />
              )}
            />
            <CategorySection
              title="Recurring Patterns"
              items={insights.categories.recurringPatterns}
              renderItem={(item: RecurringPatternItem, index: number) => (
                <div key={index}>
                  <InsightCard item={item} />
                  {item.prIds.length > 0 && (
                    <div className="ml-3 mt-1 text-xs opacity-60">
                      Seen in {item.prIds.length} PR
                      {item.prIds.length === 1 ? '' : 's'}
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
    </div>
  );
}
