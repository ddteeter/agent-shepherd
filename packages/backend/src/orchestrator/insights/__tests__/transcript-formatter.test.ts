import { describe, it, expect, afterEach } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatTranscript } from '../transcript-formatter.js';
import type { SessionLog } from '../../session-log/provider.js';

async function createTempJsonl(lines: object[]): Promise<{
  inputPath: string;
  outputDir: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await mkdtemp(join(tmpdir(), 'transcript-test-'));
  const inputPath = join(tempDir, 'test-session.jsonl');
  const outputDir = join(tempDir, 'output');
  await writeFile(
    inputPath,
    lines.map((l) => JSON.stringify(l)).join('\n'),
    'utf-8',
  );
  return {
    inputPath,
    outputDir,
    cleanup: () => rm(tempDir, { recursive: true, force: true }),
  };
}

function makeSessionLog(filePath: string): SessionLog {
  return {
    sessionId: 'sess-abc',
    filePath,
    startedAt: '2026-03-05T10:30:00Z',
    branch: 'feat/test',
  };
}

describe('TranscriptFormatter', () => {
  const cleanups: (() => Promise<void>)[] = [];

  afterEach(async () => {
    await Promise.all(cleanups.map((fn) => fn()));
    cleanups.length = 0;
  });

  it('produces frontmatter with session metadata', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('session_id: sess-abc');
    expect(content).toContain('branch: feat/test');
    expect(content).toContain(`source: ${inputPath}`);
    expect(content).toContain('started_at: 2026-03-05T10:30:00Z');
  });

  it('preserves assistant text blocks fully', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'I need to refactor the auth module because it has a circular dependency.',
            },
          ],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('## Assistant [line 1]');
    expect(content).toContain(
      'I need to refactor the auth module because it has a circular dependency.',
    );
  });

  it('formats tool_use blocks with key params', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Read',
              input: { file_path: 'src/App.tsx' },
            },
            { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
          ],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('**Tool:** `Read`(file_path: "src/App.tsx")');
    expect(content).toContain('**Tool:** `Bash`(command: "npm test")');
  });

  it('truncates large params in tool_use blocks', async () => {
    const largeContent = 'x'.repeat(200);
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              name: 'Write',
              input: { file_path: 'out.ts', content: largeContent },
            },
          ],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('content: (200 chars)');
    expect(content).not.toContain(largeContent);
  });

  it('preserves user text blocks', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'user',
        message: {
          content: [{ type: 'text', text: 'Please fix the login bug' }],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('## User [line 1]');
    expect(content).toContain('Please fix the login bug');
  });

  it('truncates tool_result blocks with preview', async () => {
    const longResult = 'A'.repeat(500);
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tu-1', content: longResult },
          ],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('**Tool Result** (500 chars)');
    expect(content).toContain('A'.repeat(200) + '...');
    expect(content).not.toContain('A'.repeat(300));
  });

  it('handles tool_result with nested content blocks', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu-1',
              content: [{ type: 'text', text: 'file contents here' }],
            },
          ],
        },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).toContain('**Tool Result** (18 chars)');
    expect(content).toContain('file contents here');
  });

  it('skips progress and file-history-snapshot types', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      { type: 'progress', data: { percent: 50 } },
      { type: 'file-history-snapshot', files: [] },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'visible' }] },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    expect(content).not.toContain('progress');
    expect(content).not.toContain('file-history-snapshot');
    expect(content).toContain('visible');
  });

  it('includes correct line numbers', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      { type: 'progress', data: {} },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'first' }] },
      },
      {
        type: 'user',
        message: { content: [{ type: 'text', text: 'second' }] },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    const content = await readFile(result, 'utf-8');

    // Line 1 is progress (skipped), line 2 is assistant, line 3 is user
    expect(content).toContain('## Assistant [line 2]');
    expect(content).toContain('## User [line 3]');
  });

  it('writes output to the correct path', async () => {
    const { inputPath, outputDir, cleanup } = await createTempJsonl([
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'hi' }] },
      },
    ]);
    cleanups.push(cleanup);

    const result = await formatTranscript(makeSessionLog(inputPath), outputDir);
    expect(result).toBe(join(outputDir, 'sess-abc.md'));
  });
});
