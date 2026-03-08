import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileTree } from '../FileTree.js';

describe('FileTree', () => {
  const files = ['src/index.ts', 'src/utils/helper.ts', 'package.json'];

  it('renders file count in header', () => {
    render(
      <FileTree files={files} selectedFile={null} onSelectFile={vi.fn()} />,
    );
    expect(screen.getByText('Files (3)')).toBeInTheDocument();
  });

  it('renders file names', () => {
    render(
      <FileTree files={files} selectedFile={null} onSelectFile={vi.fn()} />,
    );
    expect(screen.getByText('index.ts')).toBeInTheDocument();
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('calls onSelectFile when a file is clicked', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={onSelectFile}
      />,
    );
    await user.click(screen.getByText('package.json'));
    expect(onSelectFile).toHaveBeenCalledWith('package.json');
  });

  it('highlights selected file', () => {
    render(
      <FileTree
        files={files}
        selectedFile="src/index.ts"
        onSelectFile={vi.fn()}
      />,
    );
    const btn = screen.getByText('index.ts').closest('button');
    expect(btn?.style.backgroundColor).toBeTruthy();
  });

  it('renders directory nodes that can be collapsed', async () => {
    const user = userEvent.setup();
    render(
      <FileTree files={files} selectedFile={null} onSelectFile={vi.fn()} />,
    );

    expect(screen.getByText('helper.ts')).toBeInTheDocument();

    // Click the utils directory to collapse it
    const utilsDir = screen.getByText('utils');
    await user.click(utilsDir);

    expect(screen.queryByText('helper.ts')).not.toBeInTheDocument();

    // Click again to expand
    await user.click(utilsDir);
    expect(screen.getByText('helper.ts')).toBeInTheDocument();
  });

  it('shows file status badges', () => {
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileStatuses={{ 'src/index.ts': 'modified', 'package.json': 'added' }}
      />,
    );
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('shows comment counts', () => {
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        commentCounts={{ 'src/index.ts': 5 }}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows view mode toggle when fileGroups provided', () => {
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="directory"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Logical')).toBeInTheDocument();
    expect(screen.getByText('Directory')).toBeInTheDocument();
  });

  it('calls onViewModeChange when toggling view mode', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="directory"
        onViewModeChange={onViewModeChange}
      />,
    );
    await user.click(screen.getByText('Logical'));
    expect(onViewModeChange).toHaveBeenCalledWith('logical');
  });

  it('renders grouped tree in logical view mode', () => {
    const fileGroups = [
      { name: 'Core Files', files: ['src/index.ts'] },
      { name: 'Utilities', files: ['src/utils/helper.ts'] },
    ];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Core Files')).toBeInTheDocument();
    expect(screen.getByText('Utilities')).toBeInTheDocument();
  });

  it('collapses grouped tree sections', async () => {
    const user = userEvent.setup();
    const fileGroups = [{ name: 'Core Files', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();

    await user.click(screen.getByText('Core Files'));
    expect(screen.queryByText('src/index.ts')).not.toBeInTheDocument();
  });

  it('selects files in logical grouped view', async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={onSelectFile}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
      />,
    );
    await user.click(screen.getByText('src/index.ts'));
    expect(onSelectFile).toHaveBeenCalledWith('src/index.ts');
  });

  it('renders file status badges in grouped view', () => {
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
        fileStatuses={{ 'src/index.ts': 'modified' }}
        commentCounts={{ 'src/index.ts': 3 }}
      />,
    );
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('highlights selected file in grouped view', () => {
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile="src/index.ts"
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
      />,
    );
    const btn = screen.getByText('src/index.ts').closest('button');
    expect(btn?.style.backgroundColor).toBeTruthy();
  });

  it('renders ungrouped files in logical view', () => {
    const fileGroups = [{ name: 'Core', files: ['src/index.ts'] }];
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileGroups={fileGroups}
        viewMode="logical"
        onViewModeChange={vi.fn()}
      />,
    );
    // package.json and src/utils/helper.ts are not in any group
    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('renders removed file status badge', () => {
    render(
      <FileTree
        files={files}
        selectedFile={null}
        onSelectFile={vi.fn()}
        fileStatuses={{ 'package.json': 'removed' }}
      />,
    );
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('does not show view mode toggle without fileGroups', () => {
    render(
      <FileTree files={files} selectedFile={null} onSelectFile={vi.fn()} />,
    );
    expect(screen.queryByText('Logical')).not.toBeInTheDocument();
    expect(screen.queryByText('Directory')).not.toBeInTheDocument();
  });

  it('handles resize drag', () => {
    const { container } = render(
      <FileTree files={files} selectedFile={null} onSelectFile={vi.fn()} />,
    );
    // The resize handle is the last child div with cursor-col-resize
    const resizeHandle = container.querySelector('.cursor-col-resize');
    expect(resizeHandle).toBeTruthy();

    // Simulate mousedown, mousemove, mouseup
    fireEvent.mouseDown(resizeHandle!, { clientX: 256 });
    fireEvent.mouseMove(document, { clientX: 300 });
    fireEvent.mouseUp(document);
  });
});
