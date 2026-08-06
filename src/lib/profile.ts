import type { Wine, TasteProfile } from './types'

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function uniqueNonNull(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))]
}

export function buildProfile(seeds: readonly Wine[]): TasteProfile {
  const grapes: Record<string, number> = {}
  for (const seed of seeds) {
    for (const grape of new Set(seed.grapes)) {
      grapes[grape] = (grapes[grape] ?? 0) + 1
    }
  }

  return {
    seeds,
    grapes,
    regions: uniqueNonNull(seeds.map(s => s.region)),
    countries: uniqueNonNull(seeds.map(s => s.country)),
    appellations: uniqueNonNull(seeds.map(s => s.appellation)),
    tasteTags: uniqueNonNull(seeds.map(s => s.tasteTag)),
    medianPrice: median(seeds.map(s => s.price).filter(p => p > 0)),
  }
}
