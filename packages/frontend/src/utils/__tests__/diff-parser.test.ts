import { describe, it, expect } from 'vitest';
import { parseDiff } from '../diff-parser.js';

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

describe('parseDiff', () => {
  it('returns empty array for empty string', () => {
    expect(parseDiff('')).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(parseDiff(undefined as unknown as string)).toEqual([]);
  });

  it('parses a simple file with additions and deletions', () => {
    const files = parseDiff(SIMPLE_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
    expect(files[0].status).toBe('modified');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
  });

  it('detects added files (from /dev/null)', () => {
    const diff = `diff --git a/new.ts b/new.ts
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,1 @@
+export const x = 1;`;
    const files = parseDiff(diff);
    expect(files[0].status).toBe('added');
    expect(files[0].path).toBe('new.ts');
  });

  it('detects removed files (to /dev/null)', () => {
    const diff = `diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const x = 1;`;
    const files = parseDiff(diff);
    expect(files[0].status).toBe('removed');
    expect(files[0].path).toBe('old.ts');
  });

  it('parses multiple files', () => {
    const diff = `diff --git a/a.ts b/a.ts
--- /dev/null
+++ b/a.ts
@@ -0,0 +1,1 @@
+a
diff --git a/b.ts b/b.ts
--- /dev/null
+++ b/b.ts
@@ -0,0 +1,1 @@
+b`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('a.ts');
    expect(files[1].path).toBe('b.ts');
  });

  it('sets correct line numbers on hunks', () => {
    const files = parseDiff(SIMPLE_DIFF);
    const lines = files[0].hunks[0].lines;
    const contextLine = lines.find((l) => l.type === 'context');
    expect(contextLine?.oldLineNo).toBe(1);
    expect(contextLine?.newLineNo).toBe(1);
  });
});
