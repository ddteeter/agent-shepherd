import type React from 'react';

interface FileGroupHeaderProperties {
  group?: { name: string; description?: string };
  isNewGroup: boolean;
  isUngrouped: boolean;
}

export function FileGroupHeader({
  group,
  isNewGroup,
  isUngrouped,
}: Readonly<FileGroupHeaderProperties>): React.ReactElement | undefined {
  if (isNewGroup && group) {
    return (
      <div
        className="px-4 py-3 mb-2 border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary, var(--color-surface))',
        }}
      >
        <div
          className="text-sm font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          {group.name}
        </div>
        {group.description && (
          <div className="text-xs mt-0.5 opacity-60">{group.description}</div>
        )}
      </div>
    );
  }
  if (isUngrouped) {
    return (
      <div
        className="px-4 py-3 mb-2 border-b"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary, var(--color-surface))',
        }}
      >
        <div className="text-sm font-semibold opacity-60">Other Changes</div>
      </div>
    );
  }
  return undefined;
}
