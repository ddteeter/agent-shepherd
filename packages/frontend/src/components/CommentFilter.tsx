export type CommentFilterValue = 'all' | 'needs-attention' | 'agent-replied';

interface CommentFilterProps {
  activeFilter: CommentFilterValue;
  onFilterChange: (filter: CommentFilterValue) => void;
  counts: {
    all: number;
    needsAttention: number;
    agentReplied: number;
  };
}

const filters: {
  value: CommentFilterValue;
  label: string;
  countKey: keyof CommentFilterProps['counts'];
}[] = [
  { value: 'all', label: 'All', countKey: 'all' },
  {
    value: 'needs-attention',
    label: 'Needs Attention',
    countKey: 'needsAttention',
  },
  { value: 'agent-replied', label: 'Agent Replied', countKey: 'agentReplied' },
];

export function CommentFilter({
  activeFilter,
  onFilterChange,
  counts,
}: CommentFilterProps) {
  return (
    <div className="flex gap-1 p-2" role="group" aria-label="Comment filter">
      {filters.map(({ value, label, countKey }) => {
        const isActive = activeFilter === value;
        return (
          <button
            key={value}
            data-active={isActive}
            onClick={() => onFilterChange(value)}
            className="text-xs px-2.5 py-1 rounded border font-medium transition-colors"
            style={{
              borderColor: isActive
                ? 'var(--color-accent)'
                : 'var(--color-border)',
              backgroundColor: isActive
                ? 'rgba(9, 105, 218, 0.1)'
                : 'transparent',
              color: isActive ? 'var(--color-accent)' : 'var(--color-text)',
            }}
          >
            {label} ({counts[countKey]})
          </button>
        );
      })}
    </div>
  );
}
