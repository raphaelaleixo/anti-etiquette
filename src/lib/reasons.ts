import type { ScoredWine, TasteProfile, ScoreComponent } from './types'
import { getLang } from './lang'

/**
 * Reasons are composed, not looked up.
 *
 * This file writes sentences — "Shares Syrah and Grenache with your Duas
 * Quintas" — so translating it is not a matter of swapping strings. French
 * needs its own list conjunction ("et"), its own preposition contractions
 * ("d'Italie", not "de Italie"), and its own clause order. That is why the
 * language branches here rather than in the message bundle: a bundle can hold
 * a sentence, but not the grammar that builds one.
 */

function joinList(items: string[], and: string): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} ${and} ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}

/*
 * A note on why the French clauses read as labels rather than sentences.
 *
 * "Also from X" wants a preposition, and French chooses it from the gender of
 * the place and whether it takes an article: "du Portugal", "de France", "de
 * la Rioja", "des Pouilles". None of that is derivable from the string, and
 * the catalog has hundreds of regions and appellations — a lookup table would
 * be permanently incomplete and wrong in a way nobody would notice.
 *
 * Grape varieties have the same problem ("le cabernet", "la syrah").
 *
 * So the French clauses use frames that need no article: "Même région :
 * Douro" rather than "Aussi du Douro". Slightly flatter, and correct for
 * every value the catalog can return — which the alternative is not.
 */

/** The seed wine containing all these grapes, for attribution. */
function seedWithAllGrapes(profile: TasteProfile, grapes: string[]): string | null {
  return profile.seeds.find(s => grapes.every(g => s.grapes.includes(g)))?.name ?? null
}

function clauseEn(c: ScoreComponent, profile: TasteProfile): string | null {
  switch (c.kind) {
    case 'grape': {
      const grapes = joinList(c.detail, 'and')
      const seed = c.detail.length ? seedWithAllGrapes(profile, c.detail) : null
      return seed
        ? `Shares ${grapes} with your ${seed}`
        : `Shares ${grapes} with your wines`
    }
    case 'tasteTag':
      return `Same "${c.detail[0]}" taste tag`
    case 'region':
      return `Also from ${c.detail[0]}`
    case 'appellation':
      return `Same appellation (${c.detail[0]})`
    case 'country':
      return `Also from ${c.detail[0]}`
    case 'price':
      return `Around the price you usually pay`
    default:
      return null
  }
}

function clauseFr(c: ScoreComponent, profile: TasteProfile): string | null {
  switch (c.kind) {
    case 'grape': {
      const grapes = joinList(c.detail, 'et')
      const seed = c.detail.length ? seedWithAllGrapes(profile, c.detail) : null
      return seed
        ? `Partage ${grapes} avec votre ${seed}`
        : `Partage ${grapes} avec vos vins`
    }
    case 'tasteTag':
      return `Même pastille de goût « ${c.detail[0]} »`
    case 'region':
      return `Même région : ${c.detail[0]}`
    case 'appellation':
      return `Même appellation (${c.detail[0]})`
    case 'country':
      return `Même pays : ${c.detail[0]}`
    case 'price':
      return `Autour du prix que vous payez d'habitude`
    default:
      return null
  }
}

function clauseFor(c: ScoreComponent, profile: TasteProfile): string | null {
  return getLang() === 'fr' ? clauseFr(c, profile) : clauseEn(c, profile)
}

export function describeMatch(scored: ScoredWine, profile: TasteProfile): string {
  const sorted = [...scored.components].sort((a, b) => b.points - a.points)
  const top3 = sorted.slice(0, 3)

  // Check if both region and country are in the top 3
  const regionComponent = top3.find(c => c.kind === 'region')
  const countryComponent = top3.find(c => c.kind === 'country')

  let componentsToRender = top3
  let mergedClause: string | null = null

  if (regionComponent && countryComponent) {
    // Merge region and country into one clause
    mergedClause = getLang() === 'fr'
      ? `Même provenance : ${regionComponent.detail[0]}, ${countryComponent.detail[0]}`
      : `Also from ${regionComponent.detail[0]}, ${countryComponent.detail[0]}`
    // Remove both components and add a placeholder for the merged one
    componentsToRender = top3.filter(c => c.kind !== 'region' && c.kind !== 'country')
  }

  const clauses = componentsToRender
    .map(c => clauseFor(c, profile))
    .filter((c): c is string => c !== null)

  if (mergedClause) {
    clauses.push(mergedClause)
  }

  // Take up to 3 clauses
  const finalClauses = clauses.slice(0, 3)

  if (finalClauses.length === 0) {
    return getLang() === 'fr' ? 'Vendu à cette succursale.' : 'Carried at this branch.'
  }
  return finalClauses.map(c => `${c}.`).join(' ')
}
