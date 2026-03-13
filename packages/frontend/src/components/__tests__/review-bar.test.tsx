import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewBar } from '../review-bar.js';

describe('ReviewBar', () => {
  const defaultProps = {
    prStatus: 'open',
    commentCount: 3,
    agentWorking: false,
    onReview: vi.fn(),
  };

  it('renders Approve and Request Changes buttons when PR is open', () => {
    render(<ReviewBar {...defaultProps} />);
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Request Changes')).toBeInTheDocument();
  });

  it('shows comment count with plural', () => {
    render(<ReviewBar {...defaultProps} commentCount={3} />);
    expect(screen.getByText('3 comments')).toBeInTheDocument();
  });

  it('shows singular comment for count of 1', () => {
    render(<ReviewBar {...defaultProps} commentCount={1} />);
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('calls onReview with approve when Approve is clicked', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<ReviewBar {...defaultProps} onReview={onReview} />);
    await user.click(screen.getByText('Approve'));
    expect(onReview).toHaveBeenCalledWith('approve');
  });

  it('calls onReview with request-changes when Request Changes is clicked', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<ReviewBar {...defaultProps} onReview={onReview} />);
    await user.click(screen.getByText('Request Changes'));
    expect(onReview).toHaveBeenCalledWith('request-changes');
  });

  it('disables buttons when agent is working', () => {
    render(<ReviewBar {...defaultProps} agentWorking={true} />);
    expect(screen.getByText('Approve')).toBeDisabled();
    expect(screen.getByText('Request Changes')).toBeDisabled();
  });

  it('shows approved message when PR is approved', () => {
    render(<ReviewBar {...defaultProps} prStatus="approved" />);
    expect(screen.getByText(/This PR has been approved/)).toBeInTheDocument();
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
  });

  it('shows closed message when PR is closed', () => {
    render(<ReviewBar {...defaultProps} prStatus="closed" />);
    expect(screen.getByText(/This PR has been closed/)).toBeInTheDocument();
  });
});
