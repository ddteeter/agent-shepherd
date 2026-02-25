import { useState } from 'react';

interface FileTreeProps {
  files: string[];
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  return (
    <div className="w-64 border-r overflow-y-auto shrink-0" style={{ borderColor: 'var(--color-border)' }}>
      <div className="p-3 text-sm font-medium border-b" style={{ borderColor: 'var(--color-border)' }}>
        Files ({files.length})
      </div>
      <ul>
        {files.map((file) => (
          <li key={file}>
            <button
              onClick={() => onSelectFile(file)}
              className={`w-full text-left px-3 py-1.5 text-sm truncate hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
                selectedFile === file ? 'bg-blue-50 dark:bg-blue-900/30 font-medium' : ''
              }`}
            >
              {file}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
