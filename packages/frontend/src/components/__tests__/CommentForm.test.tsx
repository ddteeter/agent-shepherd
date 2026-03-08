import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentForm } from '../CommentForm.js';

describe('CommentForm', () => {
  it('shows severity selector for new comments', () => {
    render(<CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Severity:')).toBeInTheDocument();
    expect(screen.getByText('Add Comment')).toBeInTheDocument();
  });

  it('hides severity selector for replies', () => {
    render(<CommentForm onSubmit={vi.fn()} onCancel={vi.fn()} isReply />);
    expect(screen.queryByText('Severity:')).not.toBeInTheDocument();
    expect(screen.getByText('Reply')).toBeInTheDocument();
  });

  it('hides severity selector when editing', () => {
    render(
      <CommentForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isEditing
        initialBody="test"
      />,
    );
    expect(screen.queryByText('Severity:')).not.toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('submits with body and severity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText('Write a comment...'),
      'My comment',
    );
    await user.click(screen.getByText('Add Comment'));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'My comment',
      severity: 'suggestion',
    });
  });

  it('does not submit with empty body', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.click(screen.getByText('Add Comment'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit with whitespace-only body', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('Write a comment...'), '   ');
    await user.click(screen.getByText('Add Comment'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<CommentForm onSubmit={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('clears body after non-edit submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    const textarea = screen.getByPlaceholderText('Write a comment...');
    await user.type(textarea, 'My comment');
    await user.click(screen.getByText('Add Comment'));

    expect(textarea).toHaveValue('');
  });

  it('changes severity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.selectOptions(
      screen.getByDisplayValue('Suggestion'),
      'must-fix',
    );
    await user.type(
      screen.getByPlaceholderText('Write a comment...'),
      'Fix this',
    );
    await user.click(screen.getByText('Add Comment'));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'Fix this',
      severity: 'must-fix',
    });
  });

  it('submits reply without severity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} onCancel={vi.fn()} isReply />);

    await user.type(
      screen.getByPlaceholderText('Write a reply...'),
      'My reply',
    );
    await user.click(screen.getByText('Reply'));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'My reply',
      severity: undefined,
    });
  });

  it('submits edit without severity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CommentForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        isEditing
        initialBody="Original"
      />,
    );

    const textarea = screen.getByDisplayValue('Original');
    await user.clear(textarea);
    await user.type(textarea, 'Edited');
    await user.click(screen.getByText('Save'));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'Edited',
      severity: undefined,
    });
  });

  it('uses custom default severity', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CommentForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        defaultSeverity="must-fix"
      />,
    );

    await user.type(screen.getByPlaceholderText('Write a comment...'), 'Fix');
    await user.click(screen.getByText('Add Comment'));

    expect(onSubmit).toHaveBeenCalledWith({
      body: 'Fix',
      severity: 'must-fix',
    });
  });
});
