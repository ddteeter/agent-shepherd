interface ReviewBarProperties {
  prId: string;
  prStatus: string;
  commentCount: number;
  agentWorking: boolean;
  onReview: (action: 'approve' | 'request-changes') => void;
}

export function ReviewBar({
  prId,
  prStatus,
  commentCount,
  agentWorking,
  onReview,
}: ReviewBarProperties) {
  if (prStatus !== 'open') {
    return (
      <div
        className="px-6 py-3 border-t text-sm text-center"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        This PR has been {prStatus === 'approved' ? 'approved' : 'closed'}
      </div>
    );
  }

  return (
    <div
      className="px-6 py-3 border-t flex items-center justify-between"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <span className="text-sm opacity-70">
        {commentCount} comment{commentCount === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => { onReview('approve'); }}
          disabled={agentWorking}
          className="btn-approve px-4 py-1.5 text-sm rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--color-btn-approve-bg)',
            color: 'var(--color-btn-approve-fg)',
          }}
        >
          Approve
        </button>
        <button
          onClick={() => { onReview('request-changes'); }}
          disabled={agentWorking}
          className="btn-danger px-4 py-1.5 text-sm rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--color-btn-danger-bg)',
            color: 'var(--color-btn-danger-fg)',
          }}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
