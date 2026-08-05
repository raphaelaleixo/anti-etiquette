import type { CatalogFilters, WineColour } from './catalog'

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

export const COLOURS: Array<{ value: WineColour; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'orange', label: 'Orange' },
]

export const PRICE_PRESETS: Array<{ label: string; min: number | null; max: number | null }> = [
  { label: 'Under $15', min: null, max: 15 },
  { label: '$15–30', min: 15, max: 30 },
  { label: '$30–60', min: 30, max: 60 },
  { label: '$60+', min: 60, max: null },
]

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

export function colourLabel(colour: WineColour): string {
  return COLOURS.find(c => c.value === colour)?.label ?? colour
}

export function priceLabel(f: CatalogFilters): string {
  if (f.priceMin !== null && f.priceMax !== null) return `$${f.priceMin} – $${f.priceMax}`
  if (f.priceMin !== null) return `$${f.priceMin}+`
  if (f.priceMax !== null) return `Up to $${f.priceMax}`
  return 'Any price'
}

/** Short summary for the collapsed filter chip — accurate without opening it. */
export function chipSummary(f: CatalogFilters): string {
  const colour = f.colour === 'all' ? 'All' : colourLabel(f.colour)
  return `${colour} · ${priceLabel(f)}`
}

export function fullSummary(f: CatalogFilters, branchName: string): string {
  const colour = f.colour === 'all' ? 'All colours' : colourLabel(f.colour)
  return `${colour} · ${priceLabel(f)} · in stock at ${branchName}`
}
