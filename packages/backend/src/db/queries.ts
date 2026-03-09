import { eq } from 'drizzle-orm';
import type { AppDatabase } from './index.js';
import { schema } from './index.js';

/**
 * Find the latest review cycle for a PR by comparing cycle numbers.
 * Returns undefined if no cycles exist.
 */
export function getLatestCycle(database: AppDatabase, prId: string) {
  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, prId))
    .all();

  if (cycles.length === 0) return;

  let latest = cycles[0];
  for (const cycle of cycles) {
    if (cycle.cycleNumber > latest.cycleNumber) {
      latest = cycle;
    }
  }
  return latest;
}
