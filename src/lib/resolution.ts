import type { Wine, SeedKind } from './types'

/** One line of a pending add batch: what was typed, what it matched, how it's filed. */
export interface Resolution { input: string; wine: Wine | null; kind: SeedKind }

/**
 * Remove one line from a pending batch.
 *
 * Returns null once the batch is empty, which is what closes the table — an
 * empty resolution table is a dead end offering nothing to confirm.
 */
export function dismissAt(
  batch: Resolution[] | null,
  index: number,
): Resolution[] | null {
  if (!batch) return null
  const next = batch.filter((_, i) => i !== index)
  return next.length > 0 ? next : null
}
