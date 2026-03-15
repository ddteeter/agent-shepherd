import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiffViewer } from '../diff-viewer.js';
import { FileTree } from '../file-tree.js';

// Mock the highlighter to avoid loading shiki in tests
vi.mock('../../hooks/use-highlighter.js', () => ({
  useHighlighter: () => ({
    tokenizeLine: () => [],
    syntaxTheme: 'github-dark',
    setSyntaxTheme: () => {
      /* mock */
    },
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

function getDiffLines(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('.diff-line')];
}

interface AddCommentData {
  filePath: string | undefined;
  startLine: number | undefined;
  endLine: number | undefined;
  body: string;
  type: string;
}

describe('DiffViewer — multi-line comment support', () => {
  let onAddComment: ReturnType<typeof vi.fn<(data: AddCommentData) => void>>;

  beforeEach(() => {
    onAddComment = vi.fn<(data: AddCommentData) => void>();
  });

  it('opens comment form on single click', () => {
    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    fireEvent.click(lines[0]);

    expect(
      screen.getByPlaceholderText('Write a comment...'),
    ).toBeInTheDocument();

    expect(screen.queryByText(/Commenting on lines/)).not.toBeInTheDocument();
  });

  it('creates a line range on shift-click and shows range label', () => {
    const { container } = render(
      <DiffViewer
        diff={MULTI_LINE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    fireEvent.click(lines[0]);

    fireEvent.click(lines[4], { shiftKey: true });

    expect(screen.getByText(/Commenting on lines/)).toBeInTheDocument();
  });

  it('submits with startLine and endLine equal for single-line comment', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
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
    expect(call.type).toBe('suggestion');
  });

  it('cancel clears the form', () => {
    const { container } = render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        onAddComment={onAddComment}
      />,
    );

    const lines = getDiffLines(container);
    fireEvent.click(lines[0]);

    expect(
      screen.getByPlaceholderText('Write a comment...'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(
      screen.queryByPlaceholderText('Write a comment...'),
    ).not.toBeInTheDocument();
  });

  it('shows existing multi-line comment range label in CommentThread', () => {
    const multiLineComment = {
      id: 'c1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 3,
      body: 'This spans multiple lines',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={MULTI_LINE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[multiLineComment]}
        onAddComment={onAddComment}
      />,
    );

    expect(screen.getByText('L1–L3')).toBeInTheDocument();
  });
});

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
        <FileTree
          files={files}
          selectedFile={undefined}
          onSelectFile={() => {
            /* test no-op */
          }}
        />
        <DiffViewer
          diff={MULTI_FILE_DIFF}
          files={files}
          scrollToFile={undefined}
          scrollKey={0}
        />
      </div>,
    );

    const diffFiles = container.querySelectorAll<HTMLElement>(
      'div[data-file-path]',
    );
    const diffOrder = [...diffFiles].map((element) => element.dataset.filePath);

    expect(diffOrder).toEqual([
      'src/utils/helper.ts',
      'src/index.ts',
      '.gitignore',
      'package.json',
    ]);
  });
});

describe('DiffViewer — empty state', () => {
  it('shows "No diff content available" for empty diff', () => {
    render(
      <DiffViewer diff="" files={[]} scrollToFile={undefined} scrollKey={0} />,
    );
    expect(screen.getByText('No diff content available.')).toBeInTheDocument();
  });
});

describe('DiffViewer — file-level comments', () => {
  it('renders file-level comments', () => {
    const fileComment = {
      id: 'fc1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: undefined,
      endLine: undefined,
      body: 'File-level comment here',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[fileComment]}
        onAddComment={vi.fn()}
      />,
    );
    expect(screen.getByText('File-level comment here')).toBeInTheDocument();
  });
});

describe('DiffViewer — global/PR-level comments', () => {
  it('renders global comments section', () => {
    const globalComment = {
      id: 'gc1',
      reviewCycleId: 'cycle-1',
      filePath: undefined,
      startLine: undefined,
      endLine: undefined,
      body: 'Overall PR feedback',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[globalComment]}
        onAddComment={vi.fn()}
      />,
    );
    expect(screen.getByText('Overall PR feedback')).toBeInTheDocument();
    expect(screen.getByText('General comments')).toBeInTheDocument();
  });

  it('shows global comment form when globalCommentForm is true', () => {
    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        globalCommentForm={true}
        onToggleGlobalCommentForm={vi.fn()}
        onAddComment={vi.fn()}
      />,
    );
    expect(screen.getByText('General comments')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Write a comment...'),
    ).toBeInTheDocument();
  });
});

describe('DiffViewer — file-level comment form', () => {
  it('opens file-level comment form via Comment button', async () => {
    const user = userEvent.setup();
    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        onAddComment={vi.fn()}
      />,
    );
    const commentBtns = screen.getAllByText('Comment');
    await user.click(commentBtns[0]);
    expect(screen.getByText('Commenting on file')).toBeInTheDocument();
  });
});

describe('DiffViewer — orphaned comments', () => {
  it('renders orphaned comments for lines not in diff', () => {
    const orphanedComment = {
      id: 'oc1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 999,
      endLine: 999,
      body: 'Orphaned line comment',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[orphanedComment]}
        onAddComment={vi.fn()}
      />,
    );
    expect(screen.getByText('Orphaned line comment')).toBeInTheDocument();
    expect(
      screen.getByText('Comments on lines no longer in this diff'),
    ).toBeInTheDocument();
  });

  it('renders orphaned comments for files not in diff', () => {
    const orphanedComment = {
      id: 'oc2',
      reviewCycleId: 'cycle-1',
      filePath: 'src/deleted.ts',
      startLine: 10,
      endLine: 10,
      body: 'Comment on deleted file',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[orphanedComment]}
        onAddComment={vi.fn()}
      />,
    );
    expect(screen.getByText('Comment on deleted file')).toBeInTheDocument();
    expect(screen.getByText('(not in current diff)')).toBeInTheDocument();
  });
});

describe('DiffViewer — grouped file order', () => {
  it('sorts files by group order in logical view mode', () => {
    const fileGroups = [
      { name: 'Group B', files: ['package.json'] },
      { name: 'Group A', files: ['src/app.ts'] },
    ];

    const { container } = render(
      <DiffViewer
        diff={
          SIMPLE_DIFF +
          `\ndiff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -1,1 +1,1 @@\n-old\n+new`
        }
        files={['src/app.ts', 'package.json']}
        scrollToFile={undefined}
        scrollKey={0}
        fileGroups={fileGroups}
        viewMode="logical"
      />,
    );

    const fileHeaders = container.querySelectorAll<HTMLElement>(
      'div[data-file-path]',
    );
    const order = [...fileHeaders].map((element) => element.dataset.filePath);
    expect(order).toEqual(['package.json', 'src/app.ts']);
  });
});

describe('DiffViewer — reply comments', () => {
  it('groups reply comments with their parent', () => {
    const parentComment = {
      id: 'c1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 1,
      body: 'Parent comment',
      type: 'suggestion',
      author: 'human' as const,
      parentCommentId: undefined,
      resolved: false,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const replyComment = {
      id: 'r1',
      reviewCycleId: 'cycle-1',
      filePath: 'src/app.ts',
      startLine: 1,
      endLine: 1,
      body: 'Reply to parent',
      type: 'suggestion',
      author: 'agent' as const,
      parentCommentId: 'c1',
      resolved: false,
      createdAt: '2026-01-01T00:00:01Z',
    };

    render(
      <DiffViewer
        diff={SIMPLE_DIFF}
        files={['src/app.ts']}
        scrollToFile={undefined}
        scrollKey={0}
        comments={[parentComment, replyComment]}
        onAddComment={vi.fn()}
        onReplyComment={vi.fn()}
        onResolveComment={vi.fn()}
      />,
    );
    expect(screen.getByText('Parent comment')).toBeInTheDocument();
    expect(screen.getByText('Reply to parent')).toBeInTheDocument();
  });
});

describe('DiffViewer — large file collapse', () => {
  it('collapses large files by default', async () => {
    let diff = `diff --git a/big.ts b/big.ts\n--- /dev/null\n+++ b/big.ts\n@@ -0,0 +1,250 @@\n`;
    for (let index = 1; index <= 250; index++) {
      diff += `+line ${String(index)}\n`;
    }

    render(
      <DiffViewer
        diff={diff}
        files={['big.ts']}
        scrollToFile={undefined}
        scrollKey={0}
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/250 lines — click to expand/),
      ).toBeInTheDocument();
    });
  });

  it('expands collapsed file on click', async () => {
    const user = userEvent.setup();
    let diff = `diff --git a/big.ts b/big.ts\n--- /dev/null\n+++ b/big.ts\n@@ -0,0 +1,250 @@\n`;
    for (let index = 1; index <= 250; index++) {
      diff += `+line ${String(index)}\n`;
    }

    render(
      <DiffViewer
        diff={diff}
        files={['big.ts']}
        scrollToFile={undefined}
        scrollKey={0}
      />,
    );
    await user.click(screen.getByText('Expand'));
    expect(screen.getByText('line 1')).toBeInTheDocument();
  });
});
