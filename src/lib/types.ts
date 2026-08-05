export interface Wine {
  sku: string
  name: string
  urlKey: string
  price: number
  inStock: boolean
  country: string | null
  region: string | null
  appellation: string | null
  grapes: string[]
  vintage: string | null
  tasteTag: string | null
  /** SAQ's own community rating, 0-100. Null when the wine has none. */
  rating: number | null
  /** How many reviews that rating is based on. A 100 from 3 reviews is
   *  noise, so this is always shown next to it rather than hidden. */
  ratingCount: number | null
  availability: string[]
}

export interface TasteProfile {
  /** The resolved seed wines themselves — reasons.ts names them. */
  seeds: Wine[]
  /** grape name -> how many seed wines contain it */
  grapes: Record<string, number>
  regions: string[]
  countries: string[]
  appellations: string[]
  tasteTags: string[]
  medianPrice: number
}

export type ComponentKind =
  | 'grape' | 'tasteTag' | 'region' | 'appellation' | 'country' | 'price'

export interface ScoreComponent {
  kind: ComponentKind
  points: number
  /** Matched values — grape names, the region, the tag. Empty for price. */
  detail: string[]
}

export interface ScoredWine {
  wine: Wine
  total: number
  components: ScoreComponent[]
}

/**
 * 'dislike' shapes the advice — it is fed to the model as a wine to steer
 * away from, so it generalizes to similar wines. 'skip' is narrower: hide
 * this exact bottle and say nothing about it, for wines you have no quarrel
 * with but would rather not be offered again.
 */
export type SeedKind = 'like' | 'dislike' | 'skip'

/** One vocabulary for the three states, wherever they are offered. */
export const KIND_LABEL: Record<SeedKind, string> = {
  like: 'Liked',
  dislike: 'Steer clear',
  skip: 'Don’t recommend',
}

export const KINDS = Object.keys(KIND_LABEL) as SeedKind[]

export interface SeedRef {
  sku: string
  kind: SeedKind
}
