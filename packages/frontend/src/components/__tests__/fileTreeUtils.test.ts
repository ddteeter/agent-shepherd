import { describe, it, expect } from 'vitest';
import { buildFileTree, getFileTreeOrder, buildGroupedFileTree, getGroupedFileOrder, type TreeNode } from '../fileTreeUtils';

describe('buildFileTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it('returns a single file node for a root-level file', () => {
    const result = buildFileTree(['README.md']);
    expect(result).toEqual([
      { name: 'README.md', path: 'README.md', type: 'file' },
    ]);
  });

  it('collapses single-child directory chains for a deeply nested file', () => {
    const result = buildFileTree(['a/b/c/file.ts']);
    expect(result).toEqual([
      {
        name: 'a/b/c',
        path: 'a/b/c',
        type: 'directory',
        children: [{ name: 'file.ts', path: 'a/b/c/file.ts', type: 'file' }],
      },
    ]);
  });

  it('sorts directories before files at the same level', () => {
    const result = buildFileTree([
      'zebra.ts',
      'src/index.ts',
      'alpha.ts',
    ]);

    expect(result[0].type).toBe('directory');
    expect(result[0].name).toBe('src');
    expect(result[1]).toEqual({ name: 'alpha.ts', path: 'alpha.ts', type: 'file' });
    expect(result[2]).toEqual({ name: 'zebra.ts', path: 'zebra.ts', type: 'file' });
  });

  it('does not collapse multi-child directories', () => {
    const result = buildFileTree([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(result).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          { name: 'a.ts', path: 'src/a.ts', type: 'file' },
          { name: 'b.ts', path: 'src/b.ts', type: 'file' },
        ],
      },
    ]);
  });

  it('collapses single-child chains but stops at multi-child dirs', () => {
    const result = buildFileTree([
      'packages/frontend/src/a.ts',
      'packages/frontend/src/b.ts',
    ]);
    expect(result).toEqual([
      {
        name: 'packages/frontend/src',
        path: 'packages/frontend/src',
        type: 'directory',
        children: [
          { name: 'a.ts', path: 'packages/frontend/src/a.ts', type: 'file' },
          { name: 'b.ts', path: 'packages/frontend/src/b.ts', type: 'file' },
        ],
      },
    ]);
  });

  it('handles mixed root-level and nested files', () => {
    const result = buildFileTree([
      'package.json',
      'src/index.ts',
      'src/utils/helper.ts',
    ]);
    // Directory first, then root file
    expect(result[0].type).toBe('directory');
    expect(result[0].name).toBe('src');
    expect(result[1]).toEqual({ name: 'package.json', path: 'package.json', type: 'file' });

    // Inside src: directory (utils) first, then file (index.ts)
    const srcChildren = result[0].children!;
    expect(srcChildren[0].type).toBe('directory');
    expect(srcChildren[0].name).toBe('utils');
    expect(srcChildren[1]).toEqual({ name: 'index.ts', path: 'src/index.ts', type: 'file' });
  });

  it('preserves full path in file nodes', () => {
    const result = buildFileTree([
      'packages/frontend/src/components/FileTree.tsx',
      'packages/frontend/src/components/DiffViewer.tsx',
    ]);

    const dir = result[0];
    expect(dir.type).toBe('directory');

    const files = dir.children!;
    expect(files[0].path).toBe('packages/frontend/src/components/DiffViewer.tsx');
    expect(files[1].path).toBe('packages/frontend/src/components/FileTree.tsx');
  });

  it('sorts alphabetically within directory and file groups', () => {
    const result = buildFileTree([
      'src/z.ts',
      'src/a.ts',
      'src/m.ts',
      'src/beta/x.ts',
      'src/alpha/y.ts',
    ]);

    const srcChildren = result[0].children!;
    // Directories first, alphabetically
    expect(srcChildren[0].name).toBe('alpha');
    expect(srcChildren[1].name).toBe('beta');
    // Files next, alphabetically
    expect(srcChildren[2].name).toBe('a.ts');
    expect(srcChildren[3].name).toBe('m.ts');
    expect(srcChildren[4].name).toBe('z.ts');
  });

  it('getFileTreeOrder returns files in tree display order (dirs first)', () => {
    const files = [
      '.gitignore',
      'package.json',
      'packages/backend/src/index.ts',
      'packages/backend/package.json',
      'packages/frontend/src/App.tsx',
      'packages/frontend/src/components/FileTree.tsx',
      'packages/frontend/package.json',
    ];

    const order = getFileTreeOrder(files);

    // Directories come before files at each level
    // packages/ dir before root files
    // Within packages: backend before frontend (alpha)
    // Within each package: src/ dir before package.json
    expect(order).toEqual([
      'packages/backend/src/index.ts',
      'packages/backend/package.json',
      'packages/frontend/src/components/FileTree.tsx',
      'packages/frontend/src/App.tsx',
      'packages/frontend/package.json',
      '.gitignore',
      'package.json',
    ]);
  });

  it('handles a realistic PR file list', () => {
    const result = buildFileTree([
      'packages/frontend/src/components/FileTree.tsx',
      'packages/frontend/src/components/DiffViewer.tsx',
      'packages/frontend/src/components/__tests__/fileTreeUtils.test.ts',
      'packages/frontend/src/components/fileTreeUtils.ts',
      'packages/frontend/package.json',
    ]);

    // Top-level should be a single collapsed directory
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('directory');
    // packages/frontend collapsed since it's a single-child chain at that point
    expect(result[0].name).toBe('packages/frontend');

    // Inside should have src/components (collapsed dir) and package.json (file)
    const frontendChildren = result[0].children!;
    expect(frontendChildren[0].type).toBe('directory');
    expect(frontendChildren[0].name).toBe('src/components');
    expect(frontendChildren[1]).toEqual({
      name: 'package.json',
      path: 'packages/frontend/package.json',
      type: 'file',
    });
  });
});

describe('buildGroupedFileTree', () => {
  it('creates tree nodes for each group with files inside', () => {
    const groups = [
      { name: 'Database', description: 'Schema changes', files: ['packages/backend/src/db/schema.ts'] },
      { name: 'API', files: ['packages/backend/src/routes/prs.ts', 'packages/backend/src/routes/diff.ts'] },
    ];
    const allFiles = ['packages/backend/src/db/schema.ts', 'packages/backend/src/routes/prs.ts', 'packages/backend/src/routes/diff.ts'];

    const result = buildGroupedFileTree(groups, allFiles);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Database');
    expect(result[0].type).toBe('group');
    expect(result[0].description).toBe('Schema changes');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].name).toBe('packages/backend/src/db/schema.ts');
    expect(result[0].children![0].type).toBe('file');

    expect(result[1].name).toBe('API');
    expect(result[1].children).toHaveLength(2);
  });

  it('adds ungrouped files to an "Other Changes" section', () => {
    const groups = [
      { name: 'API', files: ['src/routes/prs.ts'] },
    ];
    const allFiles = ['src/routes/prs.ts', 'src/utils.ts', 'README.md'];

    const result = buildGroupedFileTree(groups, allFiles);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('API');
    expect(result[1].name).toBe('Other Changes');
    expect(result[1].children).toHaveLength(2);
    expect(result[1].children!.map(c => c.name)).toEqual(['README.md', 'src/utils.ts']);
  });

  it('returns Other Changes group when groups array is empty', () => {
    const result = buildGroupedFileTree([], ['src/index.ts']);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Other Changes');
  });
});

describe('getGroupedFileOrder', () => {
  it('returns files in group order', () => {
    const groups = [
      { name: 'Database', files: ['src/db/schema.ts'] },
      { name: 'API', files: ['src/routes/prs.ts', 'src/routes/diff.ts'] },
    ];
    const allFiles = ['src/db/schema.ts', 'src/routes/prs.ts', 'src/routes/diff.ts'];

    const order = getGroupedFileOrder(groups, allFiles);
    expect(order).toEqual(['src/db/schema.ts', 'src/routes/prs.ts', 'src/routes/diff.ts']);
  });

  it('appends ungrouped files at the end', () => {
    const groups = [
      { name: 'API', files: ['src/routes/prs.ts'] },
    ];
    const allFiles = ['src/routes/prs.ts', 'src/utils.ts'];

    const order = getGroupedFileOrder(groups, allFiles);
    expect(order).toEqual(['src/routes/prs.ts', 'src/utils.ts']);
  });
});
