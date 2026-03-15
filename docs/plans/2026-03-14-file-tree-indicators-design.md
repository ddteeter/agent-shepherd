# File Tree Indicators Visibility

**Issue:** [#10](https://github.com/ddteeter/agent-shepherd/issues/10)
**Date:** 2026-03-14

## Problem

On smaller screens or with long file paths, the file tree indicators (status badge, comment count) are pushed off-screen to the right. Users must scroll horizontally to see them.

## Solution

Move indicators from the right side to the left side of each file item, using a fixed-width indicator column so filenames align consistently.

### Layout

```
Before: [icon] [filename...............] [comment-pill] [status]
After:  [status] [comment-pill] [icon] [filename.................]
         ╰── fixed-width column ──╯
```

### Details

- Wrap status badge and comment count in a fixed-width `div` (~48px, `flex-shrink-0`)
- Items inside are right-aligned with a small gap so they sit snugly against the icon
- Files without indicators still reserve the column space for vertical alignment
- Filename remains full-width with no truncation; horizontal scroll still works for long paths
- Comment pill badge retains its current styled appearance (colored background, rounded)
- Applies to both directory and logical/grouped views
- Depth-based indentation, hover/selected styles unchanged

### Testing

- Existing file tree tests should pass with element reorder
- Update any assertions that depend on indicator element ordering
