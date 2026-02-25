interface ReviewBarProps {
  prId: string;
  prStatus: string;
  commentCount: number;
  onReview: (action: 'approve' | 'request-changes') => void;
}

export function ReviewBar({ prId, prStatus, commentCount, onReview }: ReviewBarProps) {
  if (prStatus !== 'open') {
    return (
      <div className="px-6 py-3 border-t text-sm text-center" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
        PR is {prStatus}
      </div>
    );
  }

  return (
    <div className="px-6 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
      <span className="text-sm opacity-70">{commentCount} comment{commentCount !== 1 ? 's' : ''}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onReview('approve')}
          className="px-4 py-1.5 text-sm rounded text-white font-medium"
          style={{ backgroundColor: 'var(--color-success)' }}
        >
          Approve
        </button>
        <button
          onClick={() => onReview('request-changes')}
          className="px-4 py-1.5 text-sm rounded text-white font-medium"
          style={{ backgroundColor: 'var(--color-danger)' }}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
