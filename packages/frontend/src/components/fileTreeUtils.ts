export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isFile: boolean;
  fullPath: string;
}

function buildTrie(files: string[]): TrieNode {
  const root: TrieNode = { children: new Map(), isFile: false, fullPath: '' };

  for (const file of files) {
    const segments = file.split('/');
    let current = root;
    for (let index = 0; index < segments.length; index++) {
      const seg = segments[index];
      if (!current.children.has(seg)) {
        current.children.set(seg, {
          children: new Map(),
          isFile: false,
          fullPath: segments.slice(0, index + 1).join('/'),
        });
      }
      current = current.children.get(seg)!;
    }
    current.isFile = true;
    current.fullPath = file;
  }

  return root;
}

function trieToTreeNodes(node: TrieNode): TreeNode[] {
  const directories: TreeNode[] = [];
  const fileNodes: TreeNode[] = [];

  for (const [name, child] of node.children) {
    if (child.isFile && child.children.size === 0) {
      fileNodes.push({ name, path: child.fullPath, type: 'file' });
    } else if (child.isFile) {
      // File that is also a prefix of other paths (unlikely but handle it)
      fileNodes.push({ name, path: child.fullPath, type: 'file' });
      // Children become their own nodes
      directories.push(...trieToTreeNodes(child));
    } else {
      const children = trieToTreeNodes(child);
      directories.push({ name, path: child.fullPath, type: 'directory', children });
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));
  fileNodes.sort((a, b) => a.name.localeCompare(b.name));

  return [...directories, ...fileNodes];
}

function collapseSingleChildDirectories(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.type === 'directory' && node.children) {
      let current = node;
      while (
        current.type === 'directory' &&
        current.children?.length === 1 &&
        current.children[0].type === 'directory'
      ) {
        const child = current.children[0];
        current = {
          name: `${current.name}/${child.name}`,
          path: child.path,
          type: 'directory',
          children: child.children,
        };
      }
      return {
        ...current,
        children: current.children
          ? collapseSingleChildDirectories(current.children)
          : undefined,
      };
    }
    return node;
  });
}

export function buildFileTree(files: string[]): TreeNode[] {
  if (files.length === 0) return [];

  const trie = buildTrie(files);
  const tree = trieToTreeNodes(trie);
  return collapseSingleChildDirectories(tree);
}

/** Flatten tree into file paths in display order (depth-first, dirs first) */
function flattenTree(nodes: TreeNode[]): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push(node.path);
    } else if (node.children) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

/** Get file paths in the same order as the file tree displays them */
export function getFileTreeOrder(files: string[]): string[] {
  return flattenTree(buildFileTree(files));
}

export interface GroupTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'group';
  description?: string;
  children?: GroupTreeNode[];
}

export function buildGroupedFileTree(
  groups: { name: string; description?: string; files: string[] }[],
  allFiles: string[],
): GroupTreeNode[] {
  const groupedFiles = new Set(groups.flatMap((g) => g.files));
  const result: GroupTreeNode[] = [];

  for (const group of groups) {
    const children: GroupTreeNode[] = group.files
      .filter((f) => allFiles.includes(f))
      .map((f) => ({ name: f, path: f, type: 'file' as const }));
    result.push({
      name: group.name,
      path: `__group__${group.name}`,
      type: 'group',
      description: group.description,
      children,
    });
  }

  // Ungrouped files
  const ungrouped = allFiles
    .filter((f) => !groupedFiles.has(f))
    .sort((a, b) => a.localeCompare(b));

  if (ungrouped.length > 0) {
    result.push({
      name: 'Other Changes',
      path: '__group__Other Changes',
      type: 'group',
      children: ungrouped.map((f) => ({
        name: f,
        path: f,
        type: 'file' as const,
      })),
    });
  }

  return result;
}

export function getGroupedFileOrder(
  groups: { name: string; files: string[] }[],
  allFiles: string[],
): string[] {
  const allFileSet = new Set(allFiles);
  const groupedFiles = new Set<string>();
  const order: string[] = [];

  for (const group of groups) {
    for (const f of group.files) {
      if (allFileSet.has(f)) {
        order.push(f);
        groupedFiles.add(f);
      }
    }
  }

  for (const f of allFiles) {
    if (!groupedFiles.has(f)) {
      order.push(f);
    }
  }

  return order;
}
