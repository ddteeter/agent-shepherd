import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentFilter } from '../CommentFilter.js';

describe('CommentFilter', () => {
  it('renders three filter buttons', () => {
    render(<CommentFilter activeFilter="all" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /needs attention/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agent replied/i })).toBeInTheDocument();
  });

  it('shows counts on each button', () => {
    render(<CommentFilter activeFilter="all" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    expect(screen.getByRole('button', { name: /all/i })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: /needs attention/i })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /agent replied/i })).toHaveTextContent('3');
  });

  it('calls onFilterChange when a filter button is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<CommentFilter activeFilter="all" onFilterChange={onFilterChange} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    await user.click(screen.getByRole('button', { name: /needs attention/i }));
    expect(onFilterChange).toHaveBeenCalledWith('needs-attention');
  });

  it('visually marks the active filter', () => {
    render(<CommentFilter activeFilter="needs-attention" onFilterChange={() => {}} counts={{ all: 5, needsAttention: 2, agentReplied: 3 }} />);
    const btn = screen.getByRole('button', { name: /needs attention/i });
    expect(btn.getAttribute('data-active')).toBe('true');
  });
});
