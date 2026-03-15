# File Tree Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move file status badges and comment count indicators to the left side of file tree items with a fixed-width column, so they're always visible without horizontal scrolling.

**Architecture:** Reorder elements inside `FileItemButton` — wrap status badge and comment pill in a fixed-width container placed before the file icon. Single component change + test updates.

**Tech Stack:** React, Tailwind CSS, Vitest + Testing Library

---

### Task 1: Write test for indicator position

**Files:**

- Modify: `packages/frontend/src/components/__tests__/file-tree.test.tsx`

**Step 1: Write the failing test**

Add a test that verifies indicators appear before the filename in DOM order:

```tsx
it('renders indicators before the filename', () => {
  render(
    <FileTree
      files={files}
      selectedFile={undefined}
      onSelectFile={vi.fn()}
      fileStatuses={{ 'src/index.ts': 'modified' }}
      commentCounts={{ 'src/index.ts': 3 }}
    />,
  );
  const button = screen.getByText('index.ts').closest('button')!;
  const children = [...button.children];
  const indicatorColumn = children[0];
  const fileIcon = children[1];
  const fileName = children[2];

  expect(indicatorColumn.querySelector('.text-xs')).toBeTruthy();
  expect(indicatorColumn.textContent).toContain('M');
  expect(indicatorColumn.textContent).toContain('3');
  expect(fileIcon.tagName.toLowerCase()).toBe('img');
  expect(fileName.textContent).toBe('index.ts');
});
```

**Step 2: Run test to verify it fails**

Run: `npm run test --workspace=packages/frontend -- --run file-tree.test`
Expected: FAIL — indicators are currently after the filename

**Step 3: Commit**

```bash
git add packages/frontend/src/components/__tests__/file-tree.test.tsx
git commit -m "test: add test for left-aligned file tree indicators (#10)"
```

---

### Task 2: Move indicators to fixed-width left column

**Files:**

- Modify: `packages/frontend/src/components/file-tree.tsx:49-98` (FileItemButton)

**Step 1: Reorder elements in FileItemButton**

Replace the button contents (lines 72-98) with indicators-first layout:

```tsx
      >
        <span className="inline-flex items-center justify-end gap-1 shrink-0 w-12">
          {badge && (
            <span
              className="text-xs font-bold shrink-0"
              style={{ color: badge.color }}
            >
              {badge.label}
            </span>
          )}
          {count > 0 && (
            <span
              className="text-xs shrink-0 px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor:
                  'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                color: 'var(--color-accent)',
              }}
            >
              {count}
            </span>
          )}
        </span>
        <FileIcon
          fileName={displayName}
          autoAssign
          className="w-4 h-4 shrink-0"
        />
        <span className="whitespace-nowrap flex-1">{displayName}</span>
      >
```

Key changes:

- Status badge and comment pill wrapped in a `span` with `w-12` (48px fixed width), `inline-flex`, `justify-end`, and `shrink-0`
- Badge comes first, then comment count, then file icon, then filename
- Filename span keeps `flex-1` so it still fills remaining width
- Removed `pr-3` from button className since right padding is no longer needed for indicators

**Step 2: Run tests to verify they pass**

Run: `npm run test --workspace=packages/frontend -- --run file-tree.test`
Expected: All tests PASS including the new indicator position test

**Step 3: Visual check**

Run: `npm run dev --workspace=packages/frontend`
Verify in browser that:

- Status badges (A/M/D) appear left of file icon
- Comment count pills appear left of file icon, right of status badge
- Filenames align vertically across rows (consistent left edge due to fixed-width column)
- Files without indicators still have the 48px reserved space

**Step 4: Commit**

```bash
git add packages/frontend/src/components/file-tree.tsx
git commit -m "feat: move file tree indicators to left-aligned fixed-width column (#10)"
```

---

### Task 3: Run full build and lint

**Files:** None (validation only)

**Step 1: Run lint**

Run: `npm run lint`
Expected: PASS with no errors

**Step 2: Run full build**

Run: `npm run build`
Expected: PASS with zero TypeScript errors

**Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests PASS across all packages

**Step 4: Commit any fixes if needed**

If lint/build surfaced issues, fix and commit.
