import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiffViewer } from '../DiffViewer.js';
import { FileTree } from '../FileTree.js';

// Mock the highlighter to avoid loading shiki in tests
vi.mock('../../hooks/useHighlighter.js', () => ({
  useHighlighter: () => ({
    tokenizeLine: () => null,
    syntaxTheme: 'github-dark',
    setSyntaxTheme: () => {},
  }),
  getLangFromPath: () => 'text',
}));

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,5 @@
 import express from 'express';
-const port = 3000;
+const port = 8080;
 const app = express();
 app.get('/', (req, res) => {
   res.send('Hello');`;

const MULTI_LINE_DIFF = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,8 +1,8 @@
 line one
 line two
 line three
 line four
 line five
 line six
 line seven
 line eight`;

/** Get all diff-line elements that are clickable (have the cursor-pointer class) */
function getDiffLines(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('.diff-line'));
}

type AddCommentData = { filePath: string | null; startLine: number | null; endLine: number | null; body: string; severity: string };

describe('DiffViewer — multi-line comment support', () => {
  let onAddComment: ReturnType<typeof vi.fn<(data: AddCommentData) => void>>;

  beforeEach(() => {
    onAddComment = vi.fn<(data: AddCommentData) => void>();
  });

  it('opens comment form on single click', async () => {
    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={null}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    // Click on the first diff line
    fireEvent.click(lines[0]);

    // Comment form should appear (has the textarea)
    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();

    // Should NOT show multi-line label since it's a single-line click
    expect(screen.queryByText(/Commenting on lines/)).not.toBeInTheDocument();
  });

  it('creates a line range on shift-click and shows range label', async () => {
    const { container } = render(
      <DiffViewer
        diff={MULTI_LINE_DIFF}
        files={['src/app.ts']}
        scrollToFile={null}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    // First click: sets anchor on line 1
    fireEvent.click(lines[0]);

    // Now shift-click on a later line to create a range
    fireEvent.click(lines[4], { shiftKey: true });

    // Should show the multi-line label
    expect(screen.getByText(/Commenting on lines/)).toBeInTheDocument();
  });

  it('submits with startLine and endLine equal for single-line comment', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={null}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    fireEvent.click(lines[0]);

    const textarea = screen.getByPlaceholderText('Write a comment...');
    await user.type(textarea, 'Single line comment');
    await user.click(screen.getByText('Add Comment'));

    expect(onAddComment).toHaveBeenCalledTimes(1);
    const call = onAddComment.mock.calls[0][0];
    expect(call.filePath).toBe('src/app.ts');
    expect(call.startLine).toBe(call.endLine);
    expect(call.body).toBe('Single line comment');
    expect(call.severity).toBe('suggestion');
  });

  it('cancel clears the form', () => {
    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={null}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    fireEvent.click(lines[0]);

    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  it('shows existing multi-line comment range label in CommentThread', () => {
    const multiLineComment = {
      id: 'c1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 3,
      body: 'This spans multiple lines',
      severity: 'suggestion',
      author: 'human' as const,
      parentCommentId: null,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={MULTI_LINE_DIFF}
        files={['src/app.ts']}
        scrollToFile={null}
        scrollKey={0}
        comments={[multiLineComment]}
        onAddComment={onAddComment}
      />,
    );

    // The CommentThread inside should show line range
    expect(screen.getByText('L1–L3')).toBeInTheDocument();
  });
});

// Multi-file diff where git outputs files in alphabetical path order,
// but the file tree sorts directories before files at each level.
const MULTI_FILE_DIFF = `diff --git a/.gitignore b/.gitignore
--- /dev/null
+++ b/.gitignore
@@ -0,0 +1,2 @@
+node_modules/
+dist/
diff --git a/package.json b/package.json
--- /dev/null
+++ b/package.json
@@ -0,0 +1,3 @@
+{
+  "name": "test"
+}
diff --git a/src/utils/helper.ts b/src/utils/helper.ts
--- /dev/null
+++ b/src/utils/helper.ts
@@ -0,0 +1,1 @@
+export const helper = () => {};
diff --git a/src/index.ts b/src/index.ts
--- /dev/null
+++ b/src/index.ts
@@ -0,0 +1,1 @@
+import './utils/helper';`;

describe('FileTree and DiffViewer sort order', () => {
  it('renders files in the same order in both components', () => {
    const files = [
      '.gitignore',
      'package.json',
      'src/utils/helper.ts',
      'src/index.ts',
    ];

    const { container } = render(
      <div>
        <FileTree files={files} selectedFile={null} onSelectFile={() => {}} />
        <DiffViewer
          diff={MULTI_FILE_DIFF}
          files={files}
          scrollToFile={null}
          scrollKey={0}
        />
      </div>,
    );

    // Get file order from the FileTree: file buttons (not directory buttons)
    // File buttons render file names; directory buttons have chevron SVGs
    const treeButtons = container.querySelectorAll<HTMLButtonElement>('[data-file-path]');

    // Get file order from the DiffViewer: div containers with data-file-path
    // (FileTree uses button[data-file-path], DiffViewer uses div[data-file-path])
    const diffFiles = container.querySelectorAll<HTMLElement>('div[data-file-path]');
    const diffOrder = Array.from(diffFiles).map((el) => el.dataset.filePath);

    // FileTree shows: src/ dir first (with utils/helper.ts then index.ts inside),
    // then root files .gitignore and package.json
    // DiffViewer must match this order
    expect(diffOrder).toEqual([
      'src/utils/helper.ts',
      'src/index.ts',
      '.gitignore',
      'package.json',
    ]);
  });
});
