import type { Wine } from './types'
import type { CatalogFilters } from './catalog'
import { getLang } from './lang'

/**
 * The prompt is prose the model reads, so it follows the interface language:
 * asking in French gets an answer in French, and the wine records it is built
 * from are French too once the store view has switched.
 *
 * Like `reasons.ts`, this is composition rather than lookup — the sentence
 * frames differ, not just the words in them.
 */

function describeWine(w: Wine, withRating = false): string {
  const fr = getLang() === 'fr'
  const bits = [w.country, w.region].filter((b): b is string => !!b)
  // Ratings go on shelf candidates only, and always carry their sample size —
  // the catalog has wines rated 100/100 off three reviews, and a bare score
  // would invite the model to lead with them.
  if (withRating && w.rating !== null) {
    bits.push(fr
      ? (w.ratingCount !== null
        ? `noté ${w.rating}/100 par ${w.ratingCount}`
        : `noté ${w.rating}/100`)
      : (w.ratingCount !== null
        ? `rated ${w.rating}/100 by ${w.ratingCount}`
        : `rated ${w.rating}/100`))
  }
  return bits.length ? `${w.name} — ${bits.join(', ')}` : w.name
}

/** Drop later wines that share a name (trimmed, case-insensitive) with an
 * earlier one — e.g. the same wine listed once vintaged and once not, under
 * different SKUs. Keeps the first occurrence, so the best-ranked wins. */
function dedupeByName(wines: readonly Wine[]): Wine[] {
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

const COLOUR_FR: Record<string, string> = {
  red: 'rouges', white: 'blancs', rose: 'rosés', orange: 'oranges',
}

function describeFilters(f: CatalogFilters): string {
  const fr = getLang() === 'fr'
  const colour = f.colour === 'all'
    ? (fr ? 'vins' : 'wines')
    : (fr ? `vins ${COLOUR_FR[f.colour] ?? f.colour}` : `${f.colour} wines`)
  const parts: string[] = [colour]
  if (f.priceMin !== null && f.priceMax !== null) {
    parts.push(fr ? `${f.priceMin}–${f.priceMax} $` : `$${f.priceMin}–${f.priceMax}`)
  } else if (f.priceMin !== null) {
    parts.push(fr ? `plus de ${f.priceMin} $` : `over $${f.priceMin}`)
  } else if (f.priceMax !== null) {
    parts.push(fr ? `moins de ${f.priceMax} $` : `under $${f.priceMax}`)
  }
  return parts.join(', ')
}

export function buildPrompt(
  seeds: readonly Wine[],
  dislikes: readonly Wine[],
  candidates: readonly Wine[],
  storeName: string,
  filters: CatalogFilters,
): string {
  const fr = getLang() === 'fr'
  const list = (wines: readonly Wine[], rating = false) =>
    wines.map(w => `- ${describeWine(w, rating)}`).join('\n')

  const liked = seeds.length
    ? `${fr ? "J'aime ces vins :" : 'I like these wines:'}\n${list(seeds)}`
    : (fr ? "Je cherche encore ce que j'aime." : 'I am still working out what I like.')

  const dedupedDislikes = dedupeByName(dislikes)
  const disliked = dedupedDislikes.length
    ? `${fr ? "Je n'ai pas aimé ceux-ci :" : 'I did not like these:'}\n${list(dedupedDislikes)}`
    : null

  const deduped = dedupeByName(candidates)
  const filterText = describeFilters(filters)
  const available = deduped.length
    ? (fr
      ? `La SAQ ${storeName} a présentement ces ${filterText} :\n${list(deduped, true)}`
      : `SAQ ${storeName} currently has these ${filterText}:\n${list(deduped, true)}`)
    : (fr
      ? `La SAQ ${storeName} n'a rien qui corresponde à : ${filterText}.`
      : `SAQ ${storeName} has nothing matching ${filterText}.`)

  const blocks = [liked, disliked, available].filter((b): b is string => b !== null)

  return blocks.join('\n\n') + '\n\n' + (fr
    ? 'Lesquels trois devrais-je acheter, et pourquoi ? Sois bref.'
    : 'Which three should I buy, and why? Be brief.')
}
