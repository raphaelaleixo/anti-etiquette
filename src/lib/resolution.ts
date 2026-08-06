import type { Wine, SeedKind } from './types'

/** One line of a pending add batch: what was typed, what it matched, how it's filed. */
export interface Resolution {
  input: string
  /** The currently chosen match, or null if nothing was picked. */
  wine: Wine | null
  kind: SeedKind
  /**
   * The other things the catalog thought it might be, best first.
   *
   * A typed name used to get the blind top hit and no way to see it was wrong:
   * "Pinot Noir" matches hundreds of bottles and would silently resolve to one
   * arbitrary one, which then shaped the taste profile. Offering the
   * alternatives is what turns a wrong guess into a visible choice.
   */
  candidates?: Wine[]
  /** How many the catalog matched in total, not just how many were offered. */
  candidateTotal?: number
}

/**
 * Pick a different candidate for one line, or none at all.
 *
 * `index` is into `candidates`; -1 means "none of these", which keeps the line
 * in the batch as an unmatched one rather than dropping it — dropping it is
 * what the × is for, and the two are different intentions.
 */
export function chooseCandidate(resolution: Resolution, index: number): Resolution {
  const wine = index >= 0 ? resolution.candidates?.[index] ?? null : null
  return { ...resolution, wine }
}

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
