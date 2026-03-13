import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentStatusSection } from '../agent-status-section.js';
import type { ActivityEntry } from '../agent-activity-panel.js';

describe('AgentStatusSection', () => {
  const defaultProps = {
    active: false,
    activity: [] as ActivityEntry[],
    onCancel: vi.fn(),
  };

  it('returns undefined when not active, no error, and no activity', () => {
    const { container } = render(<AgentStatusSection {...defaultProps} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows working status when active', () => {
    render(<AgentStatusSection {...defaultProps} active={true} />);
    expect(screen.getByText('Agent working...')).toBeInTheDocument();
  });

  it('shows custom label', () => {
    render(
      <AgentStatusSection
        {...defaultProps}
        active={true}
        label="Analyzing..."
      />,
    );
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('shows cancel button when active', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <AgentStatusSection
        {...defaultProps}
        active={true}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows error message', () => {
    render(
      <AgentStatusSection {...defaultProps} error="Something went wrong" />,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows activity panel when there are activity entries', () => {
    const activity: ActivityEntry[] = [
      {
        timestamp: '2026-01-01T12:00:00Z',
        type: 'tool_use',
        summary: 'Test activity',
      },
    ];
    render(<AgentStatusSection {...defaultProps} activity={activity} />);
    expect(screen.getByText(/Agent Activity/)).toBeInTheDocument();
  });
});
