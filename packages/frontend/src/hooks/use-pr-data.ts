import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import type { ActivityEntry } from '../components/agent-activity-panel.js';
import type { Comment } from '../components/comment-thread.js';
import type { FileStatus } from '../components/diff-viewer-types.js';
import type { CommentFilterValue } from '../components/comment-filter.js';
import { useWebSocket } from './use-web-socket.js';
import {
  getThreadStatus,
  groupThreads,
} from '../utils/comment-thread-status.js';
import type { ThreadStatus } from '../utils/comment-thread-status.js';

export interface ReviewCycle {
  id: string;
  prId: string;
  cycleNumber: number;
  status: string;
  reviewedAt: string | undefined;
  agentCompletedAt: string | undefined;
  hasDiffSnapshot: boolean;
  context: string | undefined;
}

export interface PrData {
  id: string;
  projectId: string;
  title: string;
  sourceBranch: string;
  baseBranch: string;
  status: string;
  workingDirectory?: string;
  agents?: Record<string, unknown>;
}

interface DiffData {
  diff: string;
  files: string[];
  fileGroups?: { name: string; description?: string; files: string[] }[];
}

interface WsMessageData {
  source?: string;
  prId?: string;
  entry?: ActivityEntry;
  error?: string;
}

export function formatAgentError(detail: string | undefined): string {
  if (detail) return `Agent error: ${detail}`;
  return 'Agent error';
}

export function sortedByCycleNumber(input: ReviewCycle[]): ReviewCycle[] {
  const copy = [...input];
  copy.sort((a, b) => a.cycleNumber - b.cycleNumber);
  return copy;
}

interface UsePrDataOptions {
  onDiffLoaded?: () => void;
}

export function usePrData(
  prId: string | undefined,
  options?: UsePrDataOptions,
) {
  const [pr, setPr] = useState<PrData | undefined>();
  const [diffData, setDiffData] = useState<DiffData | undefined>();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>('current');
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | undefined>();
  const [globalCommentForm, setGlobalCommentForm] = useState(false);
  const [agentError, setAgentError] = useState<string | undefined>();
  const [agentActivity, setAgentActivity] = useState<ActivityEntry[]>([]);
  const [commentFilter, setCommentFilter] = useState<CommentFilterValue>('all');
  const [insights, setInsights] = useState<
    Record<string, unknown> | undefined
  >();
  const [insightsActivity, setInsightsActivity] = useState<ActivityEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'review' | 'insights'>('review');
  const [analyzerRunning, setAnalyzerRunning] = useState(false);
  const [fileGroups, setFileGroups] = useState<
    | {
        name: string;
        description?: string;
        files: string[];
      }[]
    | undefined
  >();
  const [viewMode, setViewMode] = useState<'directory' | 'logical'>(
    'directory',
  );

  const fetchComments = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.comments.list(prId);
      setComments(result as Comment[]);
    } catch {
      // Comments may not exist yet
    }
  }, [prId]);

  const fetchCycles = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.prs.cycles(prId);
      setCycles(result as ReviewCycle[]);
    } catch {
      // Cycles endpoint may fail
    }
  }, [prId]);

  const fetchInsights = useCallback(async () => {
    if (!prId) return;
    try {
      const result = await api.insights.get(prId);
      setInsights(result as Record<string, unknown> | undefined);
    } catch {
      // Insights may not exist yet
    }
  }, [prId]);

  const handleWsAgentLifecycle = useCallback(
    (event: string, data: WsMessageData | undefined) => {
      setAgentError(undefined);
      if (event === 'agent:working') {
        if (data?.source === 'insights') {
          setInsightsActivity([]);
          setAnalyzerRunning(true);
        } else {
          setAgentActivity([]);
        }
      }
      if (
        (event === 'agent:completed' || event === 'agent:cancelled') &&
        data?.source === 'insights'
      ) {
        setAnalyzerRunning(false);
        void fetchInsights();
      }
      if (event === 'agent:completed' || event === 'agent:cancelled') {
        void fetchComments();
      }
      void fetchCycles();
    },
    [fetchComments, fetchCycles, fetchInsights],
  );

  useWebSocket((message) => {
    const data = message.data as WsMessageData | undefined;
    if (
      message.event === 'comment:added' ||
      message.event === 'comment:updated'
    ) {
      void fetchComments();
    }
    if (
      (message.event === 'review:submitted' ||
        message.event === 'pr:ready-for-review' ||
        message.event === 'pr:updated') &&
      prId
    ) {
      void api.prs.get(prId).then((result) => {
        setPr(result as PrData);
      });
      void fetchCycles();
    }
    if (
      message.event === 'agent:working' ||
      message.event === 'agent:completed' ||
      message.event === 'agent:cancelled'
    ) {
      handleWsAgentLifecycle(message.event, data);
    }
    if (
      message.event === 'agent:output' &&
      data?.prId === prId &&
      data?.entry
    ) {
      const entry = data.entry;
      if (data.source === 'insights') {
        setInsightsActivity((previous) => [...previous.slice(-49), entry]);
      } else {
        setAgentActivity((previous) => [...previous.slice(-49), entry]);
      }
    }
    if (message.event === 'agent:error') {
      if (data?.source === 'insights') {
        setAnalyzerRunning(false);
      }
      setAgentError(data?.error ?? 'Unknown error');
      void fetchCycles();
    }
  });

  const fetchDiff = useCallback(
    async (cycleValue: string) => {
      if (!prId) return;
      setDiffLoading(true);
      setDiffError(undefined);
      try {
        let diff: DiffData;
        if (cycleValue === 'current') {
          diff = (await api.prs.diff(prId)) as DiffData;
        } else if (cycleValue.startsWith('inter:')) {
          const [, fromString, toString_] = cycleValue.split(':');
          diff = (await api.prs.diff(prId, {
            from: Number.parseInt(fromString, 10),
            to: Number.parseInt(toString_, 10),
          })) as DiffData;
        } else {
          const cycleNumber = Number.parseInt(cycleValue, 10);
          diff = (await api.prs.diff(prId, { cycle: cycleNumber })) as DiffData;
        }
        setDiffData(diff);
        if (diff.fileGroups) {
          setFileGroups(diff.fileGroups);
          setViewMode('logical');
        } else {
          setFileGroups(undefined);
          setViewMode('directory');
        }
        options?.onDiffLoaded?.();
      } catch (error_) {
        setDiffError(
          error_ instanceof Error ? error_.message : 'Failed to load diff',
        );
      } finally {
        setDiffLoading(false);
      }
    },
    [prId, options],
  );

  useEffect(() => {
    if (!prId) return;
    void Promise.all([api.prs.get(prId), api.prs.diff(prId)])
      .then(([prResult, diffResult]) => {
        const prData = prResult as PrData;
        const diffResponse = diffResult as DiffData;
        setPr(prData);
        setDiffData(diffResponse);
        if (prData.agents?.insights) {
          setAnalyzerRunning(true);
        }
        if (diffResponse.fileGroups) {
          setFileGroups(diffResponse.fileGroups);
          setViewMode('logical');
        }
      })
      .catch((error_: unknown) => {
        setError(
          error_ instanceof Error ? error_.message : 'Failed to load PR',
        );
      })
      .finally(() => {
        setLoading(false);
      });

    void fetchComments();
    void fetchCycles();
    void fetchInsights();
  }, [prId, fetchComments, fetchCycles, fetchInsights]);

  const handleCycleChange = useCallback(
    (value: string) => {
      setSelectedCycle(value);
      void fetchDiff(value);
    },
    [fetchDiff],
  );

  const handleAddComment = useCallback(
    async (data: {
      filePath: string | undefined;
      startLine: number | undefined;
      endLine: number | undefined;
      body: string;
      type: string;
      side: 'old' | 'new' | undefined;
    }) => {
      if (!prId) return;
      try {
        await api.comments.create(prId, {
          filePath: data.filePath,
          startLine: data.startLine,
          endLine: data.endLine,
          side: data.side,
          body: data.body,
          type: data.type,
          author: 'human',
        });
        await fetchComments();
      } catch (error_) {
        console.error('Failed to add comment:', error_);
        globalThis.alert(
          'Failed to add comment. Check the console for details.',
        );
      }
    },
    [prId, fetchComments],
  );

  const handleReplyComment = useCallback(
    async (commentId: string, body: string) => {
      if (!prId) return;
      try {
        const parent = comments.find((c) => c.id === commentId);
        await api.comments.create(prId, {
          filePath: parent?.filePath,
          startLine: parent?.startLine,
          endLine: parent?.endLine,
          body,
          type: 'suggestion',
          author: 'human',
          parentCommentId: commentId,
        });
        await fetchComments();
      } catch (error_) {
        console.error('Failed to reply:', error_);
        globalThis.alert('Failed to add reply. Check the console for details.');
      }
    },
    [prId, comments, fetchComments],
  );

  const handleResolveComment = useCallback(
    async (commentId: string) => {
      try {
        await api.comments.update(commentId, { resolved: true });
        await fetchComments();
      } catch (error_) {
        console.error('Failed to resolve comment:', error_);
        globalThis.alert('Failed to resolve comment.');
      }
    },
    [fetchComments],
  );

  const handleEditComment = useCallback(
    async (commentId: string, body: string) => {
      try {
        await api.comments.update(commentId, { body });
        await fetchComments();
      } catch (error_) {
        console.error('Failed to edit comment:', error_);
        globalThis.alert('Failed to edit comment.');
      }
    },
    [fetchComments],
  );

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await api.comments.delete(commentId);
        await fetchComments();
      } catch (error_) {
        console.error('Failed to delete comment:', error_);
        globalThis.alert('Failed to delete comment.');
      }
    },
    [fetchComments],
  );

  const handleReview = useCallback(
    async (action: 'approve' | 'request-changes') => {
      if (!prId) return;
      await api.prs.review(prId, action);
      const updatedPr = await api.prs.get(prId);
      setPr(updatedPr as PrData);
      await fetchCycles();
    },
    [prId, fetchCycles],
  );

  const handleCancelAgent = useCallback(async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId);
      await fetchCycles();
    } catch (error_) {
      console.error('Failed to cancel agent:', error_);
    }
  }, [prId, fetchCycles]);

  const handleRunAnalyzer = useCallback(async () => {
    if (!prId) return;
    try {
      await api.insights.runAnalyzer(prId);
    } catch (error_) {
      console.error('Failed to start insights analyzer:', error_);
    }
  }, [prId]);

  const handleCancelAnalyzer = useCallback(async () => {
    if (!prId) return;
    try {
      await api.prs.cancelAgent(prId, 'insights');
    } catch (error_) {
      console.error('Failed to cancel analyzer:', error_);
    }
  }, [prId]);

  const handleClosePr = useCallback(async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.close(prId);
      setPr(updated as PrData);
    } catch (error_) {
      console.error('Failed to close PR:', error_);
      globalThis.alert('Failed to close PR.');
    }
  }, [prId]);

  const handleReopenPr = useCallback(async () => {
    if (!prId) return;
    try {
      const updated = await api.prs.reopen(prId);
      setPr(updated as PrData);
    } catch (error_) {
      console.error('Failed to reopen PR:', error_);
      globalThis.alert('Failed to reopen PR.');
    }
  }, [prId]);

  const fileStatuses = useMemo(() => {
    if (!diffData) return {};
    const statuses: Record<string, FileStatus> = {};
    if (typeof diffData.diff !== 'string') return {};
    const lines = diffData.diff.split('\n');
    let fromNull = false;
    let minusPath = '';
    for (const line of lines) {
      if (line.startsWith('--- /dev/null')) {
        fromNull = true;
      } else if (line.startsWith('--- a/')) {
        fromNull = false;
        minusPath = line.slice(6);
      } else if (line.startsWith('+++ /dev/null')) {
        statuses[minusPath] = 'removed';
      } else if (line.startsWith('+++ b/')) {
        const path = line.slice(6);
        statuses[path] = fromNull ? 'added' : 'modified';
      }
    }
    return statuses;
  }, [diffData]);

  const latestCycle = useMemo(() => {
    if (cycles.length === 0) return;
    let latest = cycles[0];
    for (const c of cycles) {
      if (c.cycleNumber > latest.cycleNumber) {
        latest = c;
      }
    }
    return latest;
  }, [cycles]);

  const threadStatusMap = useMemo(() => {
    const map = new Map<string, ThreadStatus>();
    if (!latestCycle) return map;
    const threads = groupThreads(comments);
    for (const thread of threads) {
      const status = getThreadStatus(
        thread.comment,
        thread.replies,
        latestCycle.id,
      );
      map.set(thread.comment.id, status);
    }
    return map;
  }, [comments, latestCycle]);

  const selectedCycleData = useMemo(() => {
    if (selectedCycle === 'current') return;
    if (selectedCycle.startsWith('inter:')) return;
    const number_ = Number.parseInt(selectedCycle, 10);
    return cycles.find((c) => c.cycleNumber === number_);
  }, [selectedCycle, cycles]);

  const filterCounts = useMemo(() => {
    let all = 0;
    let needsAttention = 0;
    let agentReplied = 0;
    for (const [, status] of threadStatusMap) {
      all++;
      if (status === 'needs-attention' || status === 'new') needsAttention++;
      if (status === 'agent-replied') agentReplied++;
    }
    return { all, needsAttention, agentReplied };
  }, [threadStatusMap]);

  const filteredComments = useMemo(() => {
    if (commentFilter === 'all') return comments;
    return comments.filter((c) => {
      const parentId = c.parentCommentId ?? c.id;
      const status = threadStatusMap.get(parentId);
      if (!status) return true;
      if (commentFilter === 'needs-attention') {
        return status === 'needs-attention' || status === 'new';
      }
      return status === 'agent-replied';
    });
  }, [comments, commentFilter, threadStatusMap]);

  const commentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filteredComments) {
      if (c.filePath) {
        counts[c.filePath] = (counts[c.filePath] ?? 0) + 1;
      }
    }
    return counts;
  }, [filteredComments]);

  const topLevelComments = useMemo(
    () => comments.filter((c) => !c.parentCommentId),
    [comments],
  );

  const agentWorking = latestCycle?.status === 'agent_working';
  const agentErrored = latestCycle?.status === 'agent_error';

  return {
    pr,
    diffData,
    comments,
    cycles,
    insights,
    loading,
    error,
    selectedCycle,
    diffLoading,
    diffError,
    globalCommentForm,
    agentError,
    agentActivity,
    commentFilter,
    insightsActivity,
    activeTab,
    analyzerRunning,
    fileGroups,
    viewMode,
    fileStatuses,
    latestCycle,
    threadStatusMap,
    selectedCycleData,
    filterCounts,
    filteredComments,
    commentCounts,
    topLevelComments,
    agentWorking,
    agentErrored,
    handleCycleChange,
    handleAddComment,
    handleReplyComment,
    handleResolveComment,
    handleEditComment,
    handleDeleteComment,
    handleReview,
    handleCancelAgent,
    handleRunAnalyzer,
    handleCancelAnalyzer,
    handleClosePr,
    handleReopenPr,
    setGlobalCommentForm,
    setCommentFilter,
    setActiveTab,
    setViewMode,
  };
}
