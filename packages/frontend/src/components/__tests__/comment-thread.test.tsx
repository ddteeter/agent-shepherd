import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentThread } from '../comment-thread.js';
import type { Comment } from '../comment-thread.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    reviewCycleId: 'cycle-1',
    filePath: 'src/index.ts',
    startLine: 10,
    endLine: 10,
    body: 'Test comment',
    type: 'suggestion',
    author: 'human',
    parentCommentId: undefined,
    resolved: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CommentThread', () => {
  it('does not show line range for single-line comments', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 10, endLine: 10 })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.queryByText(/L10–L10/)).not.toBeInTheDocument();
  });

  it('shows line range label when startLine !== endLine', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 10, endLine: 15 })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.getByText('L10–L15')).toBeInTheDocument();
  });

  it('shows line range label for a large range', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 1, endLine: 100 })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.getByText('L1–L100')).toBeInTheDocument();
  });
});

describe('CommentThread — scope badges', () => {
  it('shows PR badge for global comments (filePath is undefined)', () => {
    render(
      <CommentThread
        comment={makeComment({
          filePath: undefined,
          startLine: undefined,
          endLine: undefined,
        })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  it('shows File badge for file-level comments (startLine is undefined)', () => {
    render(
      <CommentThread
        comment={makeComment({
          filePath: 'src/index.ts',
          startLine: undefined,
          endLine: undefined,
        })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('shows line range for multi-line comments', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 5, endLine: 10 })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.getByText('L5–L10')).toBeInTheDocument();
  });

  it('shows no scope badge for single-line comments', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 5, endLine: 5 })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );

    expect(screen.queryByText('PR')).not.toBeInTheDocument();
    expect(screen.queryByText('File')).not.toBeInTheDocument();
    expect(screen.queryByText(/^L\d/)).not.toBeInTheDocument();
  });
});

describe('CommentThread — editing', () => {
  it('shows Edit button for human comments when canEdit is true', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'human' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={() => {
          /* test no-op */
        }}
        canEdit={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('does not show Edit button for agent comments', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'agent' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={() => {
          /* test no-op */
        }}
        canEdit={true}
      />,
    );

    const actionBar = screen.getByText('Reply').parentElement;
    expect(actionBar?.querySelector('button')).not.toHaveTextContent('Edit');
  });

  it('does not show Edit button when canEdit is false', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'human' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={() => {
          /* test no-op */
        }}
        canEdit={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  it('opens edit form with existing body when Edit is clicked', async () => {
    const user = userEvent.setup();

    render(
      <CommentThread
        comment={makeComment({ body: 'Original comment text' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={() => {
          /* test no-op */
        }}
        canEdit={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const textarea = screen.getByDisplayValue('Original comment text');
    expect(textarea).toBeInTheDocument();
  });

  it('calls onEdit with new body when saved', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <CommentThread
        comment={makeComment({ id: 'c1', body: 'Old text' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={onEdit}
        canEdit={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByDisplayValue('Old text');
    await user.clear(textarea);
    await user.type(textarea, 'Updated text');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEdit).toHaveBeenCalledWith('c1', 'Updated text');
  });

  it('cancels editing without calling onEdit', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <CommentThread
        comment={makeComment({ body: 'Original' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={onEdit}
        canEdit={true}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByDisplayValue('Original')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });
});

describe('CommentThread — status badges', () => {
  it('shows "Agent Replied" badge when status is agent-replied', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="agent-replied"
      />,
    );
    expect(screen.getByText('Agent Replied')).toBeInTheDocument();
  });

  it('shows "Unaddressed" badge when status is needs-attention', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="needs-attention"
      />,
    );
    expect(screen.getByText('Unaddressed')).toBeInTheDocument();
  });

  it('does not show a badge when status is new', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="new"
      />,
    );
    expect(screen.queryByText('Agent Replied')).not.toBeInTheDocument();
    expect(screen.queryByText('Unaddressed')).not.toBeInTheDocument();
  });

  it('dims the thread when status is resolved', () => {
    const { container } = render(
      <CommentThread
        comment={makeComment({ resolved: true })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="resolved"
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.5');
  });

  it('collapses replies and actions when status is resolved', () => {
    render(
      <CommentThread
        comment={makeComment({ resolved: true })}
        replies={[
          makeComment({
            id: 'r1',
            author: 'agent',
            parentCommentId: 'c1',
            body: 'Agent reply',
          }),
        ]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="resolved"
      />,
    );
    expect(screen.queryByText('Agent reply')).not.toBeInTheDocument();
    expect(screen.queryByText('Reply')).not.toBeInTheDocument();
  });

  it('expands resolved thread on click (user toggle)', async () => {
    const user = userEvent.setup();
    render(
      <CommentThread
        comment={makeComment({ resolved: true, body: 'Resolved comment' })}
        replies={[
          makeComment({
            id: 'r1',
            author: 'agent',
            parentCommentId: 'c1',
            body: 'Agent reply',
          }),
        ]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        threadStatus="resolved"
      />,
    );
    expect(screen.queryByText('Agent reply')).not.toBeInTheDocument();

    await user.click(screen.getByText('Resolved comment'));
    expect(screen.getByText('Agent reply')).toBeInTheDocument();
  });
});

describe('CommentThread — replies', () => {
  it('renders replies with author badges', () => {
    render(
      <CommentThread
        comment={makeComment()}
        replies={[
          makeComment({
            id: 'r1',
            author: 'agent',
            parentCommentId: 'c1',
            body: 'Agent reply here',
          }),
          makeComment({
            id: 'r2',
            author: 'human',
            parentCommentId: 'c1',
            body: 'Human reply here',
          }),
        ]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );
    expect(screen.getByText('Agent reply here')).toBeInTheDocument();
    expect(screen.getByText('Human reply here')).toBeInTheDocument();
  });

  it('opens and submits reply form', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    render(
      <CommentThread
        comment={makeComment({ id: 'c1' })}
        replies={[]}
        onReply={onReply}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );
    const replyButtons = screen.getAllByText('Reply');
    await user.click(replyButtons[0]);
    const textarea = screen.getByPlaceholderText('Write a reply...');
    await user.type(textarea, 'My reply');
    const submitButtons = screen.getAllByText('Reply');
    const lastSubmitButton = submitButtons.at(-1);
    if (lastSubmitButton) await user.click(lastSubmitButton);
    expect(onReply).toHaveBeenCalledWith('c1', 'My reply');
  });

  it('calls onResolve when Resolve is clicked', async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <CommentThread
        comment={makeComment({ id: 'c1' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={onResolve}
      />,
    );
    await user.click(screen.getByText('Resolve'));
    expect(onResolve).toHaveBeenCalledWith('c1');
  });

  it('hides Resolve button when comment is already resolved', () => {
    render(
      <CommentThread
        comment={makeComment({ resolved: true })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
      />,
    );
    expect(screen.queryByText('Resolve')).not.toBeInTheDocument();
  });
});

describe('CommentThread — delete', () => {
  it('shows Delete button for human comments when canEdit and onDelete provided', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'human' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onDelete={() => {
          /* test no-op */
        }}
        canEdit={true}
      />,
    );
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onDelete when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <CommentThread
        comment={makeComment({ id: 'c1', author: 'human' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onDelete={onDelete}
        canEdit={true}
      />,
    );
    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('does not show Delete for agent comments', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'agent' })}
        replies={[]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onDelete={() => {
          /* test no-op */
        }}
        canEdit={true}
      />,
    );
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});

describe('CommentThread — reply editing', () => {
  it('edits a reply', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <CommentThread
        comment={makeComment()}
        replies={[
          makeComment({
            id: 'r1',
            author: 'human',
            parentCommentId: 'c1',
            body: 'Old reply',
          }),
        ]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onEdit={onEdit}
        canEdit={true}
      />,
    );
    const editButtons = screen.getAllByText('Edit');
    await user.click(editButtons[1]);
    const textarea = screen.getByDisplayValue('Old reply');
    await user.clear(textarea);
    await user.type(textarea, 'New reply');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith('r1', 'New reply');
  });

  it('deletes a reply', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <CommentThread
        comment={makeComment()}
        replies={[
          makeComment({
            id: 'r1',
            author: 'human',
            parentCommentId: 'c1',
            body: 'Reply',
          }),
        ]}
        onReply={() => {
          /* test no-op */
        }}
        onResolve={() => {
          /* test no-op */
        }}
        onDelete={onDelete}
        canEdit={true}
      />,
    );
    const deleteButtons = screen.getAllByText('Delete');
    await user.click(deleteButtons[1]);
    expect(onDelete).toHaveBeenCalledWith('r1');
  });
});
