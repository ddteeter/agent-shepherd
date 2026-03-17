interface PRTabBarProperties {
  activeTab: 'review' | 'insights';
  onTabChange: (tab: 'review' | 'insights') => void;
  agentWorking: boolean;
  analyzerRunning: boolean;
}

export function PRTabBar({
  activeTab,
  onTabChange,
  agentWorking,
  analyzerRunning,
}: Readonly<PRTabBarProperties>) {
  return (
    <div
      className="flex border-b shrink-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        onClick={() => {
          onTabChange('review');
        }}
        className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'review' ? 'border-b-2' : 'opacity-60'}`}
        style={
          activeTab === 'review'
            ? {
                borderColor: 'var(--color-accent)',
                color: 'var(--color-accent)',
              }
            : {}
        }
      >
        Review
        {agentWorking && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
        )}
      </button>
      <button
        onClick={() => {
          onTabChange('insights');
        }}
        className={`px-4 py-2 text-sm flex items-center gap-1.5 ${activeTab === 'insights' ? 'border-b-2' : 'opacity-60'}`}
        style={
          activeTab === 'insights'
            ? {
                borderColor: 'var(--color-accent)',
                color: 'var(--color-accent)',
              }
            : {}
        }
      >
        Insights
        {analyzerRunning && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
        )}
      </button>
    </div>
  );
}
