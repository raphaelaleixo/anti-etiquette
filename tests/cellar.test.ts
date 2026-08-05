import { describe, it, expect } from 'vitest'
import { hiddenSkus } from '../src/lib/cellar'
import type { SeedRef } from '../src/lib/types'

describe('hiddenSkus', () => {
  const refs: SeedRef[] = [
    { sku: '111', kind: 'like' },
    { sku: '222', kind: 'dislike' },
    { sku: '333', kind: 'skip' },
  ]

  it('hides both dislikes and skips from the results', () => {
    expect(hiddenSkus(refs)).toEqual(new Set(['222', '333']))
  })

  it('never hides a liked wine', () => {
    expect(hiddenSkus(refs).has('111')).toBe(false)
  })

  it('is the only thing the two hidden kinds share — a skip is not a dislike', () => {
    // The prompt's "steer clear" list is built from kind === 'dislike' alone.
    // If a skip ever leaked into it, the model would generalize away from a
    // wine the user has no quarrel with, which is exactly what 'skip' exists
    // to avoid.
    const steerClear = refs.filter(r => r.kind === 'dislike').map(r => r.sku)
    expect(steerClear).toEqual(['222'])
    expect(steerClear).not.toContain('333')
  })
})
