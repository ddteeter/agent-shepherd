import { AgentActivityPanel } from './agent-activity-panel.js';
import type { ActivityEntry } from './agent-activity-panel.js';

interface AgentStatusSectionProperties {
  active: boolean;
  activity: ActivityEntry[];
  onCancel: () => void;
  label?: string;
  error?: string | undefined;
}

export function AgentStatusSection({
  active,
  activity,
  onCancel,
  label = 'Agent working...',
  error,
}: AgentStatusSectionProperties) {
  const showActivity = active || activity.length > 0;

  if (!active && !error && !showActivity) return;

  return (
    <>
      {active && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span style={{ color: 'var(--color-warning, #d29922)' }}>
            {label}
          </span>
          <button
            onClick={onCancel}
            className="text-xs px-2 py-0.5 rounded border hover:opacity-80"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div
          className="flex items-center gap-2 text-sm px-4 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          <span style={{ color: 'var(--color-danger, #cf222e)' }}>{error}</span>
        </div>
      )}
      {showActivity && (
        <div
          className="px-4 py-2 border-b shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <AgentActivityPanel entries={activity} active={active} />
        </div>
      )}
    </>
  );
}
