import { useState, useRef, useCallback, useEffect } from 'react';
import type { AddCommentData } from '../components/diff-viewer-types.js';

interface LineSelectionOptions {
  onAddComment?: (data: AddCommentData) => void;
  onToggleGlobalCommentForm?: () => void;
}

interface LineRange {
  file: string;
  startLine: number;
  endLine: number;
  side: 'old' | 'new';
}

export function useLineSelection({
  onAddComment,
  onToggleGlobalCommentForm,
}: LineSelectionOptions) {
  const [commentFormLine, setCommentFormLine] = useState<
    LineRange | undefined
  >();
  const [rangeAnchor, setRangeAnchor] = useState<
    { file: string; line: number; side: 'old' | 'new' } | undefined
  >();
  const [dragSelection, setDragSelection] = useState<LineRange | undefined>();
  const [buttonsHidden, setButtonsHidden] = useState(false);
  const isDragging = useRef(false);
  const dragAnchor = useRef<
    { file: string; line: number; side: 'old' | 'new' } | undefined
  >(undefined);
  const [fileCommentFormPath, setFileCommentFormPath] = useState<
    string | undefined
  >();

  const handleLineClick = useCallback(
    (
      filePath: string,
      lineNo: number,
      shiftKey: boolean,
      side: 'old' | 'new',
    ) => {
      if (isDragging.current) return;
      if (
        shiftKey &&
        rangeAnchor?.file === filePath &&
        rangeAnchor.side === side
      ) {
        const startLine = Math.min(rangeAnchor.line, lineNo);
        const endLine = Math.max(rangeAnchor.line, lineNo);
        setCommentFormLine({ file: filePath, startLine, endLine, side });
      } else {
        setRangeAnchor({ file: filePath, line: lineNo, side });
        setCommentFormLine({
          file: filePath,
          startLine: lineNo,
          endLine: lineNo,
          side,
        });
      }
    },
    [rangeAnchor],
  );

  const handleCancelComment = useCallback(() => {
    setCommentFormLine(undefined);
    setRangeAnchor(undefined);
    setDragSelection(undefined);
    setButtonsHidden(true);
  }, []);

  const handleAddComment = useCallback(
    (
      filePath: string | undefined,
      startLine: number | undefined,
      endLine: number | undefined,
      body: string,
      type: string,
      side: 'old' | 'new' | undefined,
    ) => {
      onAddComment?.({ filePath, startLine, endLine, body, type, side });
      setCommentFormLine(undefined);
      setRangeAnchor(undefined);
    },
    [onAddComment],
  );

  const handleFileComment = useCallback(
    (filePath: string, body: string, type: string) => {
      onAddComment?.({
        filePath,
        startLine: undefined,
        endLine: undefined,
        body,
        type,
        side: undefined,
      });
      setFileCommentFormPath(undefined);
    },
    [onAddComment],
  );

  const handleGlobalComment = useCallback(
    (body: string, type: string) => {
      onAddComment?.({
        filePath: undefined,
        startLine: undefined,
        endLine: undefined,
        body,
        type,
        side: undefined,
      });
      onToggleGlobalCommentForm?.();
    },
    [onAddComment, onToggleGlobalCommentForm],
  );

  const handleDragStart = useCallback(
    (filePath: string, lineNo: number, side: 'old' | 'new') => {
      dragAnchor.current = { file: filePath, line: lineNo, side };
    },
    [],
  );

  const handleDragOver = useCallback(
    (filePath: string, lineNo: number, side: 'old' | 'new') => {
      if (dragAnchor.current?.file !== filePath) return;
      if (dragAnchor.current.side !== side) return;
      if (dragAnchor.current.line === lineNo && !isDragging.current) return;
      isDragging.current = true;
      const start = Math.min(dragAnchor.current.line, lineNo);
      const end = Math.max(dragAnchor.current.line, lineNo);
      setDragSelection({
        file: filePath,
        startLine: start,
        endLine: end,
        side,
      });
    },
    [],
  );

  const finalizeDrag = useCallback(() => {
    const wasDragging = isDragging.current;
    isDragging.current = false;
    dragAnchor.current = undefined;
    if (wasDragging) {
      setDragSelection((sel) => {
        if (sel) {
          setCommentFormLine(sel);
          setRangeAnchor({
            file: sel.file,
            line: sel.startLine,
            side: sel.side,
          });
        }
        return sel;
      });
    }
  }, []);

  useEffect(() => {
    const onMouseUp = () => {
      if (dragAnchor.current) finalizeDrag();
    };
    globalThis.addEventListener('mouseup', onMouseUp);
    return () => {
      globalThis.removeEventListener('mouseup', onMouseUp);
    };
  }, [finalizeDrag]);

  return {
    commentFormLine,
    dragSelection,
    buttonsHidden,
    setButtonsHidden,
    fileCommentFormPath,
    setFileCommentFormPath,
    handleLineClick,
    handleCancelComment,
    handleAddComment,
    handleFileComment,
    handleGlobalComment,
    handleDragStart,
    handleDragOver,
    finalizeDrag,
  };
}
