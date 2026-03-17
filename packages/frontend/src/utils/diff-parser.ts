export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export type FileStatus = 'added' | 'removed' | 'modified';

export interface FileDiffData {
  path: string;
  hunks: DiffHunk[];
  lineCount: number;
  additions: number;
  deletions: number;
  status: FileStatus;
}

interface DiffParserState {
  currentFile: FileDiffData | undefined;
  currentHunk: DiffHunk | undefined;
  oldLine: number;
  newLine: number;
  fromNull: boolean;
  minusPath: string;
}

function createNewFile(line: string): FileDiffData {
  const gitPathMatch = /^diff --git a\/.+ b\/(.+)$/.exec(line);
  return {
    path: gitPathMatch?.[1] ?? '',
    hunks: [],
    lineCount: 0,
    additions: 0,
    deletions: 0,
    status: 'modified',
  };
}

function parseDiffHeaderLine(
  line: string,
  state: DiffParserState,
  files: FileDiffData[],
): boolean {
  if (line.startsWith('diff --git')) {
    if (state.currentFile) files.push(state.currentFile);
    state.currentFile = createNewFile(line);
    state.currentHunk = undefined;
    state.fromNull = false;
    state.minusPath = '';
    return true;
  }
  if (line.startsWith('--- /dev/null')) {
    state.fromNull = true;
    return true;
  }
  if (line.startsWith('--- a/')) {
    state.fromNull = false;
    state.minusPath = line.slice(6);
    return true;
  }
  if (line.startsWith('+++ /dev/null') && state.currentFile) {
    state.currentFile.status = 'removed';
    state.currentFile.path = state.minusPath;
    return true;
  }
  if (line.startsWith('+++ b/') && state.currentFile) {
    state.currentFile.path = line.slice(6);
    state.currentFile.status = state.fromNull ? 'added' : 'modified';
    return true;
  }
  return false;
}

function parseDiffContentLine(line: string, state: DiffParserState): void {
  if (!state.currentHunk || !state.currentFile) return;

  if (line.startsWith('+')) {
    state.currentHunk.lines.push({
      type: 'add',
      content: line.slice(1),
      newLineNo: state.newLine,
    });
    state.newLine++;
    state.currentFile.lineCount++;
    state.currentFile.additions++;
  } else if (line.startsWith('-')) {
    state.currentHunk.lines.push({
      type: 'remove',
      content: line.slice(1),
      oldLineNo: state.oldLine,
    });
    state.oldLine++;
    state.currentFile.lineCount++;
    state.currentFile.deletions++;
  } else if (line.startsWith(' ')) {
    state.currentHunk.lines.push({
      type: 'context',
      content: line.slice(1),
      oldLineNo: state.oldLine,
      newLineNo: state.newLine,
    });
    state.oldLine++;
    state.newLine++;
    state.currentFile.lineCount++;
  }
}

export function parseDiff(rawDiff: string): FileDiffData[] {
  if (typeof rawDiff !== 'string') return [];
  const files: FileDiffData[] = [];
  const lines = rawDiff.split('\n');
  const state: DiffParserState = {
    currentFile: undefined,
    currentHunk: undefined,
    oldLine: 0,
    newLine: 0,
    fromNull: false,
    minusPath: '',
  };

  for (const line of lines) {
    if (parseDiffHeaderLine(line, state, files)) continue;

    if (line.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (match) {
        state.oldLine = Number.parseInt(match[1], 10);
        state.newLine = Number.parseInt(match[2], 10);
      }
      state.currentHunk = { header: line, lines: [] };
      if (state.currentFile) state.currentFile.hunks.push(state.currentHunk);
    } else {
      parseDiffContentLine(line, state);
    }
  }

  if (state.currentFile) files.push(state.currentFile);
  return files;
}
