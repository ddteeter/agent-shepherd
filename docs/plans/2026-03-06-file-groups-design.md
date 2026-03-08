# Agent-Defined Logical File Groups for PR Review

## Problem

PR diffs are displayed in alphabetical/directory order. For multi-file changes spanning multiple concerns, this forces reviewers to mentally reconstruct the logical structure. Since an AI agent is submitting the PR, it already knows the logical groupings and can communicate them.

## Solution

Agents provide logical file groupings when submitting PRs. The frontend offers a dual-mode view: traditional directory tree and agent-defined logical groupings. Both the file tree sidebar and diff viewer reflect the active mode.

## Data Model

### Schema Change

New nullable column on `diff_snapshots`:

```sql
file_groups TEXT -- JSON string, nullable
```

### Types (`@agent-shepherd/shared`)

```typescript
export interface FileGroup {
  name: string; // e.g., "Database Schema Changes"
  description?: string; // e.g., "Review the schema design first"
  files: string[]; // Full paths, e.g., ["packages/backend/src/db/schema.ts"]
}
```

`DiffSnapshot` gains:

```typescript
fileGroups: FileGroup[] | null;
```

### Rules

- Each cycle's snapshot stores a complete, self-contained groups array (no merging across cycles)
- A file may appear in at most one group
- Files in the diff but not in any group appear in an auto-generated "Other Changes" section
- Group array order = display order
- `fileGroups: null` means no grouping was provided

## CLI Changes

### `agent-shepherd submit`

New optional flag:

```bash
agent-shepherd submit --file-groups groups.json
```

Reads the JSON file and sends it with the PR creation payload.

### `agent-shepherd ready`

New optional flag:

```bash
agent-shepherd ready --file-groups groups.json
```

Sends updated groups with the new review cycle. **Validation:** if the previous cycle had file groups but `--file-groups` is not provided, `ready` returns an error:

> This PR has file groups from the previous cycle. You must provide --file-groups. Run `agent-shepherd file-groups <pr-id>` to fetch the current groups and update them.

### `agent-shepherd file-groups`

New command to fetch current groups:

```bash
agent-shepherd file-groups <pr-id>
```

Returns the file groups from the most recent cycle's diff snapshot as JSON. Used by agents during fix cycles to fetch existing groups before adjusting.

## API Changes

### New Endpoint

`GET /api/prs/:id/file-groups?cycle=N` — Returns file groups for a specific cycle, or the latest cycle if no param. Returns `null` if no groups exist.

### Modified Endpoints

- PR creation route: accepts optional `fileGroups` in the request body, stored on the initial diff snapshot
- Ready/new-cycle route: accepts optional `fileGroups`, stored on the new cycle's diff snapshot. Returns 400 if previous cycle had groups but none provided.

## Frontend

### File Tree Sidebar

- **Toggle:** Two buttons at the top of the sidebar: `Directory | Logical`. Only visible when the current cycle has non-null `fileGroups`.
- **Default:** `Logical` view when groups are available.
- **Directory mode:** Existing trie-based tree, unchanged.
- **Logical mode:**
  - Each `FileGroup` renders as a collapsible section
  - Group name as section header
  - Group description in muted/smaller text below the name
  - Files listed with full paths (not just filenames)
  - File status badges (A/M/D) and comment counts shown per file
  - "Other Changes" section at the end for ungrouped files

### Diff Viewer

- **Logical mode active:** Diffs reordered to match group order
- **Group headers:** Visual separators between groups in the diff scroll area showing group name + description
- **Scroll sync:** Clicking a group name in the tree scrolls to that group's first file in the diff. Scrolling the diff updates the active group/file in the tree.
- **Directory mode:** Existing behavior unchanged

## Skill Updates

### `agent-shepherd-submit-pr`

Updated to teach agents to create `file-groups.json`:

**Format:**

```json
[
  {
    "name": "Database Schema",
    "description": "New tables and migration. Review schema design first.",
    "files": [
      "packages/backend/src/db/schema.ts",
      "drizzle/0005_add_feature.sql"
    ]
  },
  {
    "name": "API Layer",
    "description": "REST endpoints exposing the new functionality.",
    "files": ["packages/backend/src/routes/feature.ts"]
  }
]
```

**Guidance:**

- Group by logical concern, not directory structure
- Name groups to describe what they represent ("Authentication Flow" not "src/auth/")
- Descriptions should tell the reviewer what to look for
- Order groups in recommended review sequence (e.g., schema first, then API, then UI)
- Every changed file should appear in exactly one group
- Keep group count reasonable (2-6 for most PRs)

**Fix-cycle instructions:**

1. Run `agent-shepherd file-groups <pr-id>` to fetch current groups
2. Review which files you've changed or added
3. Add new files to the most appropriate existing group, or create a new group if they represent a distinct concern
4. Keep existing group names/descriptions stable unless changes fundamentally alter them
5. Provide the complete updated groups via `agent-shepherd ready --file-groups updated-groups.json`
