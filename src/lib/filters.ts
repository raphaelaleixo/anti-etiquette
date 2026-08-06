import type { CatalogFilters, WineColour } from './catalog'
import { t } from './lang'

/**
 * Filter state and its pure presentation logic.
 *
 * These lived in `FilterSheet.tsx` in the React app, which meant the tests
 * imported a module that also pulled in React. Nothing here renders anything;
 * the sheet is just the first caller.
 */

export const DEFAULT_FILTERS: CatalogFilters = {
  colour: 'red',
  priceMin: 15,
  priceMax: 30,
}

/**
 * The colours and bands are data; their labels are language.
 *
 * Keeping the values here and the words in the message bundle means adding a
 * colour is a one-line change in one file, and translating one is a one-line
 * change in another — rather than both being the same line.
 */
export const COLOURS: readonly WineColour[] = ['all', 'red', 'white', 'rose', 'orange']

const COLOUR_KEY = {
  all: 'colourAll', red: 'colourRed', white: 'colourWhite',
  rose: 'colourRose', orange: 'colourOrange',
} as const

export function colourLabel(colour: WineColour): string {
  return t()[COLOUR_KEY[colour]]
}

export const PRICE_PRESETS: ReadonlyArray<{ min: number | null; max: number | null }> = [
  { min: null, max: 15 },
  { min: 15, max: 30 },
  { min: 30, max: 60 },
  { min: 60, max: null },
]

export function presetLabel(p: { min: number | null; max: number | null }): string {
  if (p.min === null && p.max !== null) return t().priceUnder(p.max)
  if (p.min !== null && p.max === null) return t().priceOver(p.min)
  if (p.min !== null && p.max !== null) return t().priceBetween(p.min, p.max)
  return t().anyPrice
}

/**
 * Whether two filter sets would produce the same search.
 *
 * Used to decide if applying the sheet should discard the current results, so
 * that opening it to check what is set — and applying without changing
 * anything — does not throw away a search. Add a field to `CatalogFilters` and
 * it must be compared here too; a forgotten field silently keeps stale results
 * on screen.
 */
export function filtersEqual(a: CatalogFilters, b: CatalogFilters): boolean {
  return a.colour === b.colour && a.priceMin === b.priceMin && a.priceMax === b.priceMax
}

export function priceLabel(f: CatalogFilters): string {
  if (f.priceMin !== null && f.priceMax !== null) return t().priceRange(f.priceMin, f.priceMax)
  if (f.priceMin !== null) return t().priceFrom(f.priceMin)
  if (f.priceMax !== null) return t().priceUpTo(f.priceMax)
  return t().anyPrice
}

/** Short summary for the collapsed filter chip — accurate without opening it. */
export function chipSummary(f: CatalogFilters): string {
  return `${colourLabel(f.colour)} · ${priceLabel(f)}`
}

export function fullSummary(f: CatalogFilters, branchName: string): string {
  const colour = f.colour === 'all' ? t().allColours : colourLabel(f.colour)
  return t().filterSummary(colour, priceLabel(f), branchName)
}
