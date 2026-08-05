import type { ScoredWine, TasteProfile, ScoreComponent } from './types'

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** The seed wine containing all these grapes, for attribution. */
function seedWithAllGrapes(profile: TasteProfile, grapes: string[]): string | null {
  return profile.seeds.find(s => grapes.every(g => s.grapes.includes(g)))?.name ?? null
}

function clauseFor(c: ScoreComponent, profile: TasteProfile): string | null {
  switch (c.kind) {
    case 'grape': {
      const grapes = joinList(c.detail)
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
    mergedClause = `Also from ${regionComponent.detail[0]}, ${countryComponent.detail[0]}`
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

  if (finalClauses.length === 0) return 'Carried at this branch.'
  return finalClauses.map(c => `${c}.`).join(' ')
}
