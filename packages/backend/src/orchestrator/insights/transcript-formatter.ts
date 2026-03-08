import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { SessionLog } from '../session-log/provider.js';

/** Max chars to show for tool result previews */
const TOOL_RESULT_PREVIEW_LENGTH = 200;

/** Params to truncate in tool_use blocks (contain large content) */
const LARGE_PARAMS = new Set([
  'content',
  'new_string',
  'old_string',
  'command',
]);

/** Max chars for a large param value in tool_use output */
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

/**
 * Reads a raw JSONL session log and writes a formatted markdown file
 * preserving behavioral signal while dropping bulk tool result content.
 * Returns the path to the formatted file.
 */
export async function formatTranscript(
  sessionLog: SessionLog,
  outputDir: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, `${sessionLog.sessionId}.md`);
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`source: ${sessionLog.filePath}`);
  lines.push(`session_id: ${sessionLog.sessionId}`);
  lines.push(`branch: ${sessionLog.branch}`);
  lines.push(`started_at: ${sessionLog.startedAt}`);
  lines.push('---');
  lines.push('');

  const rl = createInterface({
    input: createReadStream(sessionLog.filePath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const rawLine of rl) {
    lineNum++;
    if (!rawLine.trim()) continue;

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      continue; // skip malformed lines
    }

    if (parsed.type === 'progress' || parsed.type === 'file-history-snapshot') {
      continue;
    }

    const content = parsed.message?.content;
    if (!content || !Array.isArray(content)) continue;

    if (parsed.type === 'assistant') {
      lines.push(`## Assistant [line ${lineNum}]`);
      lines.push('');
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          lines.push(block.text);
          lines.push('');
        } else if (block.type === 'tool_use' && block.name) {
          lines.push(
            `**Tool:** \`${block.name}\`${formatToolParams(block.input)}`,
          );
          lines.push('');
        }
      }
    } else if (parsed.type === 'user') {
      lines.push(`## User [line ${lineNum}]`);
      lines.push('');
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          lines.push(block.text);
          lines.push('');
        } else if (block.type === 'tool_result') {
          const resultText = extractToolResultText(block);
          const size = resultText.length;
          const preview = resultText.slice(0, TOOL_RESULT_PREVIEW_LENGTH);
          const truncated = size > TOOL_RESULT_PREVIEW_LENGTH ? '...' : '';
          lines.push(
            `**Tool Result** (${size} chars): \`${preview}${truncated}\``,
          );
          lines.push('');
        }
      }
    }
  }

  await writeFile(outputPath, lines.join('\n'), 'utf-8');
  return outputPath;
}

function formatToolParams(input?: Record<string, unknown>): string {
  if (!input || Object.keys(input).length === 0) return '';

  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    if (LARGE_PARAMS.has(key) && strVal.length > LARGE_PARAM_MAX) {
      parts.push(`${key}: (${strVal.length} chars)`);
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
      .map((b) => b.text!)
      .join('\n');
  }
  return '';
}
