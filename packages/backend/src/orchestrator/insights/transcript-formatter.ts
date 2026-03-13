import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { SessionLog } from '../session-log/provider.js';

const TOOL_RESULT_PREVIEW_LENGTH = 200;

const LARGE_PARAMS = new Set([
  'content',
  'new_string',
  'old_string',
  'command',
]);

const LARGE_PARAM_MAX = 120;

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
}

interface TranscriptLine {
  type: string;
  message?: {
    content?: ContentBlock[];
  };
}

export async function formatTranscript(
  sessionLog: SessionLog,
  outputDirectory: string,
): Promise<string> {
  await mkdir(outputDirectory, { recursive: true });

  const outputPath = path.join(outputDirectory, `${sessionLog.sessionId}.md`);
  const lines: string[] = [
    '---',
    `source: ${sessionLog.filePath}`,
    `session_id: ${sessionLog.sessionId}`,
    `branch: ${sessionLog.branch}`,
    `started_at: ${sessionLog.startedAt}`,
    '---',
    '',
  ];

  const rl = createInterface({
    input: createReadStream(sessionLog.filePath, 'utf8'),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let lineNumber = 0;
  for await (const rawLine of rl) {
    lineNumber++;
    if (!rawLine.trim()) continue;

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(rawLine) as TranscriptLine;
    } catch {
      continue;
    }

    if (parsed.type === 'progress' || parsed.type === 'file-history-snapshot') {
      continue;
    }

    const content = parsed.message?.content;
    if (!content || !Array.isArray(content)) continue;

    if (parsed.type === 'assistant') {
      lines.push(`## Assistant [line ${String(lineNumber)}]`, '');
      formatAssistantBlocks(content, lines);
    } else if (parsed.type === 'user') {
      lines.push(`## User [line ${String(lineNumber)}]`, '');
      formatUserBlocks(content, lines);
    }
  }

  await writeFile(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

function formatAssistantBlocks(content: ContentBlock[], lines: string[]): void {
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      lines.push(block.text, '');
    } else if (block.type === 'tool_use' && block.name) {
      lines.push(
        `**Tool:** \`${block.name}\`${formatToolParameters(block.input)}`,
        '',
      );
    }
  }
}

function formatUserBlocks(content: ContentBlock[], lines: string[]): void {
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      lines.push(block.text, '');
    } else if (block.type === 'tool_result') {
      const resultText = extractToolResultText(block);
      const size = resultText.length;
      const preview = resultText.slice(0, TOOL_RESULT_PREVIEW_LENGTH);
      const truncated = size > TOOL_RESULT_PREVIEW_LENGTH ? '...' : '';
      lines.push(
        `**Tool Result** (${String(size)} chars): \`${preview}${truncated}\``,
        '',
      );
    }
  }
}

function formatToolParameters(input?: Record<string, unknown>): string {
  if (!input || Object.keys(input).length === 0) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (LARGE_PARAMS.has(key) && stringValue.length > LARGE_PARAM_MAX) {
      parts.push(`${key}: (${String(stringValue.length)} chars)`);
    } else {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

function extractToolResultText(block: ContentBlock): string {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text ?? '')
      .join('\n');
  }
  return '';
}
