import { useState, useEffect, useRef } from 'react';

export interface ActivityEntry {
  timestamp: string;
  type: string;
  summary: string;
}

interface AgentActivityPanelProps {
  entries: ActivityEntry[];
}

export function AgentActivityPanel({ entries }: AgentActivityPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, expanded]);

  if (entries.length === 0) return null;

  return (
    <div
      className="mx-6 my-1 rounded border text-xs"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:opacity-80"
        style={{ color: 'var(--color-text)' }}
      >
        <span className="font-medium opacity-70">
          Agent Activity ({entries.length})
        </span>
        <span className="opacity-50">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div
          ref={scrollRef}
          className="px-3 pb-2 overflow-y-auto"
          style={{ maxHeight: '10rem' }}
        >
          {entries.map((entry, i) => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return (
              <div key={i} className="flex gap-2 py-0.5 opacity-80" style={{ color: 'var(--color-text)' }}>
                <span className="opacity-50 shrink-0">{time}</span>
                <span>{entry.summary}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
