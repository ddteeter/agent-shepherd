import { useState } from 'react';

interface CommentFormProps {
  onSubmit: (data: { body: string; severity?: string }) => void;
  onCancel: () => void;
  isReply?: boolean;
  isEditing?: boolean;
  initialBody?: string;
  defaultSeverity?: string;
}

export function CommentForm({ onSubmit, onCancel, isReply = false, isEditing = false, initialBody = '', defaultSeverity = 'suggestion' }: CommentFormProps) {
  const [body, setBody] = useState(initialBody);
  const [severity, setSeverity] = useState(defaultSeverity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    onSubmit({ body, severity: isReply || isEditing ? undefined : severity });
    if (!isEditing) setBody('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border rounded mt-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isReply ? 'Write a reply...' : 'Write a comment...'}
        className="w-full p-2 border rounded text-sm resize-y min-h-[60px]"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
        autoFocus
      />
      {!isReply && !isEditing && (
        <div className="mt-2">
          <label className="text-xs font-medium mr-2">Severity:</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="text-sm border rounded px-2 py-1"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
          >
            <option value="suggestion">Suggestion</option>
            <option value="request">Request</option>
            <option value="must-fix">Must Fix</option>
          </select>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button type="submit" className="px-3 py-1 text-sm rounded text-white" style={{ backgroundColor: 'var(--color-accent)' }}>
          {isEditing ? 'Save' : isReply ? 'Reply' : 'Add Comment'}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border" style={{ borderColor: 'var(--color-border)' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
