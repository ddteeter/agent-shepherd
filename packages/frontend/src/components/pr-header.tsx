import { Link } from 'react-router-dom';
import {
  sortedByCycleNumber,
  type ReviewCycle,
  type PrData,
} from '../hooks/use-pr-data.js';

interface PRHeaderProperties {
  pr: PrData;
  selectedCycle: string;
  selectedCycleData: ReviewCycle | undefined;
  cycles: ReviewCycle[];
  diffLoading: boolean;
  diffError: string | undefined;
  agentWorking: boolean;
  onCycleChange: (value: string) => void;
  onToggleGlobalCommentForm: () => void;
  onClosePr: () => void;
  onReopenPr: () => void;
}

export function PRHeader({
  pr,
  selectedCycle,
  selectedCycleData,
  cycles,
  diffLoading,
  diffError,
  agentWorking,
  onCycleChange,
  onToggleGlobalCommentForm,
  onClosePr,
  onReopenPr,
}: Readonly<PRHeaderProperties>) {
  const cyclesWithSnapshots = cycles.filter((c) => c.hasDiffSnapshot);
  const showCycleSelector = cyclesWithSnapshots.length > 0;

  return (
    <div
      className="px-6 py-3 border-b shrink-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <Link
        to={`/projects/${pr.projectId}`}
        className="text-sm opacity-70 hover:opacity-100"
      >
        &larr; Back
      </Link>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{pr.title}</h2>
          {selectedCycle === 'current' && (
            <button
              onClick={() => {
                onToggleGlobalCommentForm();
              }}
              className="text-xs px-2 py-1 rounded border hover:opacity-80"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              Comment on PR
            </button>
          )}
          {pr.status === 'open' && !agentWorking && (
            <button
              onClick={() => {
                onClosePr();
              }}
              className="text-xs px-2 py-1 rounded border hover:opacity-80"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              Close PR
            </button>
          )}
          {pr.status === 'closed' && (
            <button
              onClick={() => {
                onReopenPr();
              }}
              className="text-xs px-2 py-1 rounded border hover:opacity-80"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-accent)',
              }}
            >
              Reopen
            </button>
          )}
        </div>
        {showCycleSelector && (
          <div className="flex items-center gap-2">
            <label htmlFor="cycle-select" className="text-sm opacity-70">
              Viewing:
            </label>
            <select
              id="cycle-select"
              value={selectedCycle}
              onChange={(event) => {
                onCycleChange(event.target.value);
              }}
              disabled={diffLoading}
              className="text-sm px-2 py-1 rounded border"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              <option value="current">Latest (live)</option>
              {(() => {
                const sortedSnapshots =
                  sortedByCycleNumber(cyclesWithSnapshots);
                return sortedSnapshots.map((cycle) => (
                  <option key={cycle.id} value={String(cycle.cycleNumber)}>
                    Cycle {cycle.cycleNumber}
                    {cycle.status === 'approved' ? ' (approved)' : ''}
                    {cycle.status === 'changes_requested'
                      ? ' (changes requested)'
                      : ''}
                    {cycle.status === 'superseded' ? ' (superseded)' : ''}
                  </option>
                ));
              })()}
              {cyclesWithSnapshots.length >= 2 && (
                <>
                  <option disabled>───────────</option>
                  {(() => {
                    const sorted = sortedByCycleNumber(cyclesWithSnapshots);
                    const options: React.ReactNode[] = [];

                    for (const cycle of sorted.slice(1)) {
                      const previousCycle = sorted.find(
                        (c) => c.cycleNumber === cycle.cycleNumber - 1,
                      );
                      if (!previousCycle) continue;
                      options.push(
                        <option
                          key={`inter-${String(previousCycle.cycleNumber)}-${String(cycle.cycleNumber)}`}
                          value={`inter:${String(previousCycle.cycleNumber)}:${String(cycle.cycleNumber)}`}
                        >
                          Changes: Cycle {previousCycle.cycleNumber} →{' '}
                          {cycle.cycleNumber}
                        </option>,
                      );
                    }

                    const reviewedCycles: ReviewCycle[] = sorted.filter(
                      (c) =>
                        c.status !== 'superseded' &&
                        c.status !== 'pending_review',
                    );
                    const latestCycleSorted: ReviewCycle | undefined =
                      sorted.at(-1);
                    if (reviewedCycles.length > 0 && latestCycleSorted) {
                      const lastReviewed: ReviewCycle | undefined =
                        reviewedCycles.at(-1);
                      if (
                        lastReviewed &&
                        lastReviewed.cycleNumber !==
                          latestCycleSorted.cycleNumber - 1
                      ) {
                        options.push(
                          <option
                            key={`reviewed-${String(lastReviewed.cycleNumber)}-${String(latestCycleSorted.cycleNumber)}`}
                            value={`inter:${String(lastReviewed.cycleNumber)}:${String(latestCycleSorted.cycleNumber)}`}
                          >
                            Changes: Since last review (Cycle{' '}
                            {lastReviewed.cycleNumber} →{' '}
                            {latestCycleSorted.cycleNumber})
                          </option>,
                        );
                      }
                    }

                    return options;
                  })()}
                </>
              )}
            </select>
            {diffLoading && (
              <span className="text-sm opacity-50">Loading...</span>
            )}
            {diffError && (
              <span className="text-sm text-red-500">Failed to load diff</span>
            )}
          </div>
        )}
      </div>
      <div className="text-sm opacity-70">
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-medium mr-2"
          style={{
            backgroundColor:
              pr.status === 'open'
                ? 'rgba(46, 160, 67, 0.15)'
                : 'rgba(130, 130, 130, 0.15)',
            color:
              pr.status === 'open'
                ? 'var(--color-success)'
                : 'var(--color-text)',
          }}
        >
          {pr.status}
        </span>
        {pr.sourceBranch} &rarr; {pr.baseBranch}
        {pr.workingDirectory && (
          <span
            className="ml-2 inline-block px-2 py-0.5 rounded text-xs"
            style={{ backgroundColor: 'rgba(130, 130, 130, 0.1)' }}
            title={pr.workingDirectory}
          >
            {pr.workingDirectory.split('/').slice(-2).join('/')}
          </span>
        )}
        {selectedCycle !== 'current' && (
          <span
            className="ml-2 inline-block px-2 py-0.5 rounded text-xs font-medium"
            style={{
              backgroundColor: 'rgba(130, 80, 223, 0.15)',
              color: 'var(--color-text)',
            }}
          >
            Snapshot from Cycle {selectedCycle}
          </span>
        )}
        {selectedCycleData?.context && (
          <span
            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--color-text)',
            }}
          >
            Resubmit context:{' '}
            {selectedCycleData.context.length > 200
              ? selectedCycleData.context.slice(0, 200) + '...'
              : selectedCycleData.context}
          </span>
        )}
      </div>
    </div>
  );
}
