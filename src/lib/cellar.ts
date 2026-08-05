import type { SeedRef } from './types'

/**
 * The saved wine list.
 *
 * Task 1 seeds this module with the one pure function that survives `seeds.ts`
 * unchanged. Task 3 fills in the rest: the `cellar.v2` document, the
 * identity-stable snapshot, subscription, and the mutators that publish from
 * inside themselves. The Firebase-specific parts of `seeds.ts` — per-SKU
 * writes, `subscribeSeeds`, `addSeed` — are not ported; they existed to stop
 * two phones clobbering each other, a requirement this fork deletes.
 */

/**
 * The SKUs that must not appear in the results.
 *
 * Dislikes and skips both drop out, but for different reasons, and only this
 * union is shared: dislikes go on to the prompt as wines to steer away from,
 * while skips are never mentioned to the model at all. Keeping the two apart
 * is the whole point of the third kind — a skip removes one bottle, it does
 * not argue against everything resembling it.
 */
export function hiddenSkus(refs: SeedRef[]): Set<string> {
  return new Set(
    refs.filter(r => r.kind === 'dislike' || r.kind === 'skip').map(r => r.sku),
  )
}
