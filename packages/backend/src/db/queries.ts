import { eq } from 'drizzle-orm';
import { schema } from './index.js';

/**
 * Find the latest review cycle for a PR by comparing cycle numbers.
 * Returns null if no cycles exist.
 */
export function getLatestCycle(database: any, prId: string) {
  const cycles = database
    .select()
    .from(schema.reviewCycles)
    .where(eq(schema.reviewCycles.prId, prId))
    .all();

  return cycles.reduce(
    (latest: any, cycle: any) =>
      cycle.cycleNumber > (latest?.cycleNumber ?? 0) ? cycle : latest,
    null,
  );
}
