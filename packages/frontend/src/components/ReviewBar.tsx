import { useState } from 'react';

interface ReviewBarProps {
  prId: string;
  prStatus: string;
  commentCount: number;
  hasAgentSession: boolean;
  onReview: (action: 'approve' | 'request-changes', opts?: { clearSession?: boolean }) => void;
}

export function ReviewBar({ prId, prStatus, commentCount, hasAgentSession, onReview }: ReviewBarProps) {
  const [clearSession, setClearSession] = useState(false);

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
      <div className="flex items-center gap-3">
        {hasAgentSession && (
          <label className="flex items-center gap-1.5 text-sm cursor-pointer opacity-70 hover:opacity-100">
            <input
              type="checkbox"
              checked={clearSession}
              onChange={(e) => setClearSession(e.target.checked)}
            />
            Start fresh session
          </label>
        )}
        <button
          onClick={() => onReview('approve')}
          className="btn-approve px-4 py-1.5 text-sm rounded font-medium"
          style={{ backgroundColor: 'var(--color-btn-approve-bg)', color: 'var(--color-btn-approve-fg)' }}
        >
          Approve
        </button>
        <button
          onClick={() => onReview('request-changes', clearSession ? { clearSession: true } : undefined)}
          className="btn-danger px-4 py-1.5 text-sm rounded font-medium"
          style={{ backgroundColor: 'var(--color-btn-danger-bg)', color: 'var(--color-btn-danger-fg)' }}
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}
