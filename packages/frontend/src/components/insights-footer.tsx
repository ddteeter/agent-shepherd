interface InsightsFooterProperties {
  analyzerRunning: boolean;
  hasComments: boolean;
  onRunAnalyzer: () => void;
  onCancelAnalyzer: () => void;
}

export function InsightsFooter({
  analyzerRunning,
  hasComments,
  onRunAnalyzer,
  onCancelAnalyzer,
}: Readonly<InsightsFooterProperties>) {
  return (
    <div
      className="px-6 py-3 border-t flex items-center justify-end"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      {analyzerRunning && (
        <button
          onClick={() => {
            onCancelAnalyzer();
          }}
          className="px-4 py-1.5 text-sm rounded font-medium border hover:opacity-80"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          Cancel Analyzer
        </button>
      )}
      {hasComments && !analyzerRunning && (
        <button
          onClick={() => {
            onRunAnalyzer();
          }}
          className="btn-danger px-4 py-1.5 text-sm rounded font-medium"
          style={{
            backgroundColor: 'var(--color-btn-danger-bg)',
            color: 'var(--color-btn-danger-fg)',
          }}
        >
          Run Analyzer
        </button>
      )}
    </div>
  );
}
