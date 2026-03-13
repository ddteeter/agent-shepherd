import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AgentActivityPanel,
  type ActivityEntry,
} from '../agent-activity-panel.js';

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    timestamp: '2026-01-01T12:00:00Z',
    type: 'tool_use',
    summary: 'Running tests',
    ...overrides,
  };
}

describe('AgentActivityPanel', () => {
  it('returns undefined when entries is empty', () => {
    const { container } = render(<AgentActivityPanel entries={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders activity count in header', () => {
    render(<AgentActivityPanel entries={[makeEntry()]} />);
    expect(screen.getByText(/Agent Activity \(1\)/)).toBeInTheDocument();
  });

  it('shows entries when expanded (default when active)', () => {
    render(<AgentActivityPanel entries={[makeEntry()]} active={true} />);
    expect(screen.getByText('Running tests')).toBeInTheDocument();
  });

  it('toggles expanded state on header click', async () => {
    const user = userEvent.setup();
    render(<AgentActivityPanel entries={[makeEntry()]} active={true} />);

    expect(screen.getByText('Running tests')).toBeInTheDocument();

    const header = screen.getByText(/Agent Activity/);
    await user.click(header);

    expect(screen.queryByText('Running tests')).not.toBeInTheDocument();
  });

  it('shows verbose badge when entries have details', () => {
    render(
      <AgentActivityPanel
        entries={[makeEntry({ detail: 'detailed output' })]}
      />,
    );
    expect(screen.getByText('verbose')).toBeInTheDocument();
  });

  it('shows detail content when an entry row with detail is clicked', async () => {
    const user = userEvent.setup();
    render(
      <AgentActivityPanel
        entries={[makeEntry({ detail: 'Test output details' })]}
      />,
    );

    const summaryRow = screen.getByText('Running tests');
    await user.click(summaryRow);

    expect(screen.getByText('Test output details')).toBeInTheDocument();
  });

  it('applies italic style for text-type entries', () => {
    render(
      <AgentActivityPanel
        entries={[makeEntry({ type: 'text', summary: 'Thinking...' })]}
      />,
    );
    const row = screen.getByText('Thinking...').closest('div');
    expect(row?.style.fontStyle).toBe('italic');
  });

  it('collapses when active changes from true to false', () => {
    const { rerender } = render(
      <AgentActivityPanel entries={[makeEntry()]} active={true} />,
    );
    expect(screen.getByText('Running tests')).toBeInTheDocument();

    rerender(<AgentActivityPanel entries={[makeEntry()]} active={false} />);
    expect(screen.queryByText('Running tests')).not.toBeInTheDocument();
  });
});
