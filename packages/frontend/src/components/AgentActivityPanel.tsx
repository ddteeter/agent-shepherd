import { useState, useEffect, useRef } from 'react';

export interface ActivityEntry {
  timestamp: string;
  type: string;
  summary: string;
  detail?: string;
}

interface AgentActivityPanelProperties {
  entries: ActivityEntry[];
  active?: boolean;
}

function ActivityEntryRow({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const hasDetail = !!entry.detail;
  const isText = entry.type === 'text';
  const isToolResult = entry.type === 'tool_result';

  return (
    <div className="py-0.5" style={{ color: 'var(--color-text)' }}>
      <div
        className={`flex gap-2 ${hasDetail ? 'cursor-pointer hover:opacity-100' : ''} ${isText || isToolResult ? 'opacity-50' : 'opacity-80'}`}
        style={isText ? { fontStyle: 'italic' } : undefined}
        onClick={hasDetail ? () => { setExpanded(!expanded); } : undefined}
      >
        <span className="opacity-50 shrink-0">{time}</span>
        {hasDetail && (
          <span className="opacity-50 shrink-0 select-none">
            {expanded ? '\u25BC' : '\u25B6'}
          </span>
        )}
        <span className="truncate">{entry.summary}</span>
      </div>
      {expanded && entry.detail && (
        <pre
          className="mt-1 ml-6 p-2 rounded text-xs overflow-auto whitespace-pre-wrap break-words"
          style={{
            maxHeight: '20rem',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            opacity: 0.9,
          }}
        >
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export function AgentActivityPanel({
  entries,
  active,
}: AgentActivityPanelProperties) {
  const [expanded, setExpanded] = useState(active !== false);
  const previousActiveReference = useRef(active);
  const scrollReference = useRef<HTMLDivElement>(null);
  const isVerbose = entries.some((e) => e.detail);

  useEffect(() => {
    if (previousActiveReference.current === true && active === false) {
      setExpanded(false);
    }
    previousActiveReference.current = active;
  }, [active]);

  useEffect(() => {
    if (expanded && scrollReference.current) {
      scrollReference.current.scrollTop = scrollReference.current.scrollHeight;
    }
  }, [entries, expanded]);

  if (entries.length === 0) return null;

  return (
    <div
      className="mx-6 my-1 rounded border text-xs"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <button
        onClick={() => { setExpanded(!expanded); }}
        className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:opacity-80"
        style={{ color: 'var(--color-text)' }}
      >
        <span className="font-medium opacity-70">
          Agent Activity ({entries.length})
          {isVerbose && (
            <span className="ml-2 opacity-50 text-[10px] uppercase tracking-wider">
              verbose
            </span>
          )}
        </span>
        <span className="opacity-50">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>
      {expanded && (
        <div
          ref={scrollReference}
          className="px-3 pb-2 overflow-y-auto"
          style={{ maxHeight: isVerbose ? '24rem' : '10rem' }}
        >
          {entries.map((entry, index) => (
            <ActivityEntryRow key={index} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
