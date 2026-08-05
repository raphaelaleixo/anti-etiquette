import type { Wine, TasteProfile, ScoreComponent, ScoredWine } from './types'

export const WEIGHTS = {
  grape: 35,
  tasteTag: 20,
  region: 15,
  appellation: 10,
  country: 10,
  price: 10,
} as const

/** Availability values that mean "do not recommend this". */
const UNAVAILABLE = [
  'Unavailable',
  'Sold out',
  'Products that are not available',
  'In a lottery',
]

function jaccard(a: string[], b: string[]): { score: number; shared: string[] } {
  if (a.length === 0 || b.length === 0) return { score: 0, shared: [] }
  const setA = new Set(a)
  const setB = new Set(b)
  const shared = [...setA].filter(x => setB.has(x))
  const union = new Set([...setA, ...setB])
  return { score: shared.length / union.size, shared }
}

export function scoreWine(wine: Wine, profile: TasteProfile): ScoredWine | null {
  if (profile.seeds.length === 0) return null
  if (profile.seeds.some(s => s.sku === wine.sku)) return null
  if (wine.availability.some(a => UNAVAILABLE.includes(a))) return null

  const components: ScoreComponent[] = []

  const g = jaccard(wine.grapes, Object.keys(profile.grapes))
  if (g.score > 0) {
    components.push({
      kind: 'grape',
      points: WEIGHTS.grape * g.score,
      detail: g.shared,
    })
  }

  const exact: Array<[ScoreComponent['kind'], string | null, string[], number]> = [
    ['tasteTag', wine.tasteTag, profile.tasteTags, WEIGHTS.tasteTag],
    ['region', wine.region, profile.regions, WEIGHTS.region],
    ['appellation', wine.appellation, profile.appellations, WEIGHTS.appellation],
    ['country', wine.country, profile.countries, WEIGHTS.country],
  ]
  for (const [kind, value, pool, weight] of exact) {
    if (value !== null && pool.includes(value)) {
      components.push({ kind, points: weight, detail: [value] })
    }
  }

  if (profile.medianPrice > 0 && wine.price > 0) {
    const closeness = Math.max(
      0,
      1 - Math.abs(wine.price - profile.medianPrice) / profile.medianPrice,
    )
    if (closeness > 0) {
      components.push({
        kind: 'price',
        points: WEIGHTS.price * closeness,
        detail: [],
      })
    }
  }

  return {
    wine,
    total: components.reduce((t, c) => t + c.points, 0),
    components,
  }
}

export function rankWines(
  wines: Wine[],
  profile: TasteProfile,
  limit: number,
): ScoredWine[] {
  return wines
    .map(w => scoreWine(w, profile))
    .filter((s): s is ScoredWine => s !== null && s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}
