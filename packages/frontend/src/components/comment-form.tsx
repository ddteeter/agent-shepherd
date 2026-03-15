import { useState } from 'react';

interface CommentFormProperties {
  onSubmit: (data: { body: string; type?: string }) => void;
  onCancel: () => void;
  isReply?: boolean;
  isEditing?: boolean;
  initialBody?: string;
  defaultType?: string;
}

export function CommentForm({
  onSubmit,
  onCancel,
  isReply = false,
  isEditing = false,
  initialBody = '',
  defaultType = 'suggestion',
}: Readonly<CommentFormProperties>) {
  const [body, setBody] = useState(initialBody);
  const [type, setType] = useState(defaultType);

  const defaultButtonLabel = isReply ? 'Reply' : 'Add Comment';

  const handleSubmit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    onSubmit({ body, type: isReply || isEditing ? undefined : type });
    if (!isEditing) setBody('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 border rounded mt-2"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      <textarea
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        placeholder={isReply ? 'Write a reply...' : 'Write a comment...'}
        className="w-full p-2 border rounded text-sm resize-y min-h-[60px]"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
        autoFocus
      />
      {!isReply && !isEditing && (
        <div className="mt-2">
          <label className="text-xs font-medium mr-2">Type:</label>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
            }}
            className="text-sm border rounded px-2 py-1"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
            }}
          >
            <option value="question">Question</option>
            <option value="suggestion">Suggestion</option>
            <option value="request">Request</option>
            <option value="must-fix">Must Fix</option>
          </select>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          className="px-3 py-1 text-sm rounded text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          {isEditing ? 'Save' : defaultButtonLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-sm rounded border"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
