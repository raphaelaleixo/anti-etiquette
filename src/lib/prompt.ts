import type { Wine } from './types'
import type { CatalogFilters } from './catalog'

function describeWine(w: Wine, withRating = false): string {
  const bits = [w.country, w.region].filter((b): b is string => !!b)
  // Ratings go on shelf candidates only, and always carry their sample size —
  // the catalog has wines rated 100/100 off three reviews, and a bare score
  // would invite the model to lead with them.
  if (withRating && w.rating !== null) {
    bits.push(w.ratingCount !== null
      ? `rated ${w.rating}/100 by ${w.ratingCount}`
      : `rated ${w.rating}/100`)
  }
  return bits.length ? `${w.name} — ${bits.join(', ')}` : w.name
}

/** Drop later wines that share a name (trimmed, case-insensitive) with an
 * earlier one — e.g. the same wine listed once vintaged and once not, under
 * different SKUs. Keeps the first occurrence, so the best-ranked wins. */
function dedupeByName(wines: Wine[]): Wine[] {
  const seen = new Set<string>()
  const result: Wine[] = []
  for (const w of wines) {
    const key = w.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(w)
  }
  return result
}

function describeFilters(f: CatalogFilters): string {
  const colour = f.colour === 'all' ? 'wines' : `${f.colour} wines`
  const parts: string[] = [colour]
  if (f.priceMin !== null && f.priceMax !== null) {
    parts.push(`$${f.priceMin}–${f.priceMax}`)
  } else if (f.priceMin !== null) {
    parts.push(`over $${f.priceMin}`)
  } else if (f.priceMax !== null) {
    parts.push(`under $${f.priceMax}`)
  }
  return parts.join(', ')
}

export function buildPrompt(
  seeds: Wine[],
  dislikes: Wine[],
  candidates: Wine[],
  storeName: string,
  filters: CatalogFilters,
): string {
  const liked = seeds.length
    ? `I like these wines:\n${seeds.map(s => `- ${describeWine(s)}`).join('\n')}`
    : 'I am still working out what I like.'

  const dedupedDislikes = dedupeByName(dislikes)
  const disliked = dedupedDislikes.length
    ? `I did not like these:\n${dedupedDislikes.map(d => `- ${describeWine(d)}`).join('\n')}`
    : null

  const deduped = dedupeByName(candidates)
  const available = deduped.length
    ? `SAQ ${storeName} currently has these ${describeFilters(filters)}:\n` +
      deduped.map(c => `- ${describeWine(c, true)}`).join('\n')
    : `SAQ ${storeName} has nothing matching ${describeFilters(filters)}.`

  const blocks = [liked, disliked, available].filter((b): b is string => b !== null)

  return blocks.join('\n\n') + '\n\n' +
    'Which three should I buy, and why? Be brief.'
}
