import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentThread } from '../CommentThread.js';
import type { Comment } from '../CommentThread.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    reviewCycleId: 'cycle-1',
    filePath: 'src/index.ts',
    startLine: 10,
    endLine: 10,
    body: 'Test comment',
    severity: 'suggestion',
    author: 'human',
    parentCommentId: null,
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
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.queryByText(/L10–L10/)).not.toBeInTheDocument();
  });

  it('shows line range label when startLine !== endLine', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 10, endLine: 15 })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('L10–L15')).toBeInTheDocument();
  });

  it('shows line range label for a large range', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 1, endLine: 100 })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('L1–L100')).toBeInTheDocument();
  });
});

describe('CommentThread — scope badges', () => {
  it('shows PR badge for global comments (filePath is null)', () => {
    render(
      <CommentThread
        comment={makeComment({ filePath: null, startLine: null, endLine: null })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  it('shows File badge for file-level comments (startLine is null)', () => {
    render(
      <CommentThread
        comment={makeComment({ filePath: 'src/index.ts', startLine: null, endLine: null })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('shows line range for multi-line comments', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 5, endLine: 10 })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.getByText('L5–L10')).toBeInTheDocument();
  });

  it('shows no scope badge for single-line comments', () => {
    render(
      <CommentThread
        comment={makeComment({ startLine: 5, endLine: 5 })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
        onEdit={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
        onEdit={() => {}}
        canEdit={true}
      />,
    );

    // The action bar Edit button should not appear for agent comments
    const actionBar = screen.getByText('Reply').parentElement!;
    expect(actionBar.querySelector('button')).not.toHaveTextContent('Edit');
  });

  it('does not show Edit button when canEdit is false', () => {
    render(
      <CommentThread
        comment={makeComment({ author: 'human' })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        onEdit={() => {}}
        canEdit={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('opens edit form with existing body when Edit is clicked', async () => {
    const user = userEvent.setup();

    render(
      <CommentThread
        comment={makeComment({ body: 'Original comment text' })}
        replies={[]}
        onReply={() => {}}
        onResolve={() => {}}
        onEdit={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
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
        onReply={() => {}}
        onResolve={() => {}}
        threadStatus="resolved"
      />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.opacity).toBe('0.5');
  });
});
