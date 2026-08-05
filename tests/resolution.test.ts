import { describe, it, expect } from 'vitest'
import { dismissAt, type Resolution } from '../src/lib/resolution'
import type { Wine } from '../src/lib/types'

const wine = (name: string) => ({ sku: '1', name, price: 20 } as Wine)
const row = (input: string, w: Wine | null = wine(input)): Resolution =>
  ({ input, wine: w, kind: 'like' })

describe('dismissAt', () => {
  it('drops only the named line, keeping the rest of the batch', () => {
    const batch = [row('A'), row('B'), row('C')]
    expect(dismissAt(batch, 1)?.map(r => r.input)).toEqual(['A', 'C'])
  })

  it('closes the table once the last line goes', () => {
    // The point of the whole change: an empty table offers nothing to confirm.
    expect(dismissAt([row('only')], 0)).toBeNull()
  })

  it('keeps the batch open while anything remains', () => {
    expect(dismissAt([row('A'), row('B')], 0)).toHaveLength(1)
  })

  it('drops an unmatched line without touching the good matches', () => {
    const batch = [row('Duas Quintas'), row('zzzz', null), row('Chapoutier')]
    const left = dismissAt(batch, 1)
    expect(left?.map(r => r.input)).toEqual(['Duas Quintas', 'Chapoutier'])
    expect(left?.every(r => r.wine !== null)).toBe(true)
  })

  it('preserves each line’s chosen kind', () => {
    const batch: Resolution[] = [
      { ...row('A'), kind: 'dislike' },
      { ...row('B'), kind: 'skip' },
      { ...row('C'), kind: 'like' },
    ]
    expect(dismissAt(batch, 0)?.map(r => r.kind)).toEqual(['skip', 'like'])
  })

  it('is a no-op on an already-closed batch', () => {
    expect(dismissAt(null, 0)).toBeNull()
  })
})
