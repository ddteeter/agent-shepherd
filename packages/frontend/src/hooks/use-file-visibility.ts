import { useState, useRef, useCallback, useEffect } from 'react';
import type { FileDiffData } from '../utils/diff-parser.js';

interface UseFileVisibilityOptions {
  parsedFiles: FileDiffData[];
  scrollToFile: string | undefined;
  scrollKey: number;
  onVisibleFileChange?: (file: string) => void;
}

function handleIntersectingEntry(
  path: string,
  visibleSet: Set<string>,
): boolean {
  if (visibleSet.has(path)) return false;
  visibleSet.add(path);
  return true;
}

function handleNonIntersectingEntry(
  path: string,
  visibleSet: Set<string>,
  fileReferences: React.RefObject<Record<string, HTMLDivElement | undefined>>,
  pinnedReference: React.RefObject<string | undefined>,
  setMeasuredHeights: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >,
): boolean {
  const element = fileReferences.current[path];
  if (element) {
    const height = element.getBoundingClientRect().height;
    setMeasuredHeights((previous_) => ({
      ...previous_,
      [path]: height,
    }));
  }
  if (visibleSet.has(path) && path !== pinnedReference.current) {
    visibleSet.delete(path);
    return true;
  }
  return false;
}

function updateVisibleFiles(
  previous: Set<string>,
  entries: IntersectionObserverEntry[],
  fileReferences: React.RefObject<Record<string, HTMLDivElement | undefined>>,
  pinnedReference: React.RefObject<string | undefined>,
  setMeasuredHeights: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >,
): Set<string> {
  const next = new Set(previous);
  let changed = false;
  for (const entry of entries) {
    const path = (entry.target as HTMLElement).dataset.filePath;
    if (!path) continue;
    changed = entry.isIntersecting
      ? handleIntersectingEntry(path, next) || changed
      : handleNonIntersectingEntry(
          path,
          next,
          fileReferences,
          pinnedReference,
          setMeasuredHeights,
        ) || changed;
  }
  return changed ? next : previous;
}

export function useFileVisibility(options: UseFileVisibilityOptions) {
  const { parsedFiles, scrollToFile, scrollKey, onVisibleFileChange } = options;

  const containerReference = useRef<HTMLDivElement>(undefined);
  const fileReferences = useRef<Record<string, HTMLDivElement | undefined>>({});
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [measuredHeights, setMeasuredHeights] = useState<
    Record<string, number>
  >({});
  const pinnedReference = useRef<string | undefined>(undefined);
  const isScrolling = useRef(false);
  const observerReference = useRef<IntersectionObserver | undefined>(undefined);

  useEffect(() => {
    const container = containerReference.current;
    if (!container) return;

    observerReference.current = new IntersectionObserver(
      (entries) => {
        setVisible((previous) =>
          updateVisibleFiles(
            previous,
            entries,
            fileReferences,
            pinnedReference,
            setMeasuredHeights,
          ),
        );
      },
      { root: container, rootMargin: '800px 0px' },
    );

    for (const path of Object.keys(fileReferences.current)) {
      const element = fileReferences.current[path];
      if (element) observerReference.current.observe(element);
    }

    return () => {
      observerReference.current?.disconnect();
    };
  }, [parsedFiles]);

  const createFileReferenceCallback = useCallback(
    (filePath: string) => (element: HTMLDivElement | null) => {
      fileReferences.current[filePath] = element ?? undefined;
      if (element && observerReference.current) {
        observerReference.current.observe(element);
      }
    },
    [],
  );

  if (scrollToFile && !visible.has(scrollToFile)) {
    setVisible((previous) => {
      if (previous.has(scrollToFile)) return previous;
      const next = new Set(previous);
      next.add(scrollToFile);
      return next;
    });
  }

  useEffect(() => {
    if (!scrollToFile) return;
    pinnedReference.current = scrollToFile;
    isScrolling.current = true;
    requestAnimationFrame(() => {
      fileReferences.current[scrollToFile]?.scrollIntoView({ block: 'start' });
      setTimeout(() => {
        fileReferences.current[scrollToFile]?.scrollIntoView({
          block: 'start',
        });
        requestAnimationFrame(() => {
          isScrolling.current = false;
          pinnedReference.current = undefined;
        });
      }, 150);
    });
  }, [scrollToFile, scrollKey]);

  useEffect(() => {
    const container = containerReference.current;
    if (!onVisibleFileChange || !container) return;

    let rafId: number;
    const handleScroll = () => {
      if (isScrolling.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const containerTop = container.getBoundingClientRect().top;
        let closest: string | undefined;
        let closestDistribution = Number.POSITIVE_INFINITY;
        for (const file of parsedFiles) {
          const element = fileReferences.current[file.path];
          if (!element) continue;
          const rect = element.getBoundingClientRect();
          if (
            rect.bottom > containerTop &&
            rect.top < containerTop + container.clientHeight
          ) {
            const distribution = Math.abs(rect.top - containerTop);
            if (distribution < closestDistribution) {
              closestDistribution = distribution;
              closest = file.path;
            }
          }
        }
        if (closest) onVisibleFileChange(closest);
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [parsedFiles, onVisibleFileChange]);

  return {
    visible,
    measuredHeights,
    containerRef: containerReference,
    fileRefs: fileReferences,
    createFileRefCallback: createFileReferenceCallback,
  };
}
