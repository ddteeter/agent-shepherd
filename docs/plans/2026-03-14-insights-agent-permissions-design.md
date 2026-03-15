# Insights Agent Permission Issues — Design

**Issue:** #15
**Date:** 2026-03-14

## Problem

The insights agent wastes 3-20 attempts per session trying to submit JSON findings via `agent-shepherd insights update <pr-id> --stdin`. Claude Code's sandbox blocks every naive approach:

| Approach                                          | Block reason                                                  |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `echo '{"categories":...}' \| agent-shepherd ...` | "Contains brace with quote character (expansion obfuscation)" |
| `cat <<'EOF' \| agent-shepherd ...` (heredoc)     | Same brace+quote detection                                    |
| `python3 -c "..." \| agent-shepherd ...`          | python3 not in allowedTools                                   |
| `< file agent-shepherd ...` (input redirection)   | "Could read sensitive files"                                  |
| Writing to `/tmp/`                                | Requires explicit permission grant                            |

The agent eventually discovers a working pattern (`Write` tool → `cat file \| command` → `rm`), but rediscovers it from scratch each session.

## Root Cause

The workflow-analyzer skill (lines 156-157) explicitly teaches the broken pattern:

```bash
echo '<json>' | agent-shepherd insights update <pr-id> --stdin
```

## Solution

Update the skill's "Output Format" section to teach the working pattern:

1. Use the `Write` tool to save JSON to a temp file in the project directory (e.g., `tmp-insights.json`)
2. Pipe via `cat tmp-insights.json | agent-shepherd insights update <pr-id> --stdin`
3. Clean up with `rm tmp-insights.json`

No code changes needed — the CLI and piping already work. This is purely a skill documentation fix.

## Scope

- Update `skills/agent-shepherd-workflow-analyzer/SKILL.md` output format section
- Add a note explaining why the `Write` → `cat` → `rm` pattern is necessary (sandbox restrictions)
