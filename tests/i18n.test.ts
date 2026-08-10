import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { en } from '../src/lib/i18n/en'
import { fr } from '../src/lib/i18n/fr'
import * as lang from '../src/lib/lang'
import * as catalog from '../src/lib/catalog'
import { storage } from '../src/lib/storage'
import * as cellar from '../src/lib/cellar'
import * as hydrate from '../src/lib/hydrate'
import * as reasons from '../src/lib/reasons'
import * as prompt from '../src/lib/prompt'
import { wine } from './helpers'

type Bundle = Record<string, unknown>

const enKeys = Object.keys(en as Bundle).sort()
const frKeys = Object.keys(fr as Bundle).sort()

afterEach(() => {
  storage.removeItem('lang')
  lang.setLang('en')
  vi.restoreAllMocks()
})

/**
 * The type already rejects a missing key at build time. These cover what it
 * cannot: a translation that drops an interpolation, which TypeScript accepts
 * because a function of fewer parameters is assignable to one of more.
 */
describe('the two bundles stay in step', () => {
  it('has the same keys on both sides', () => {
    expect(frKeys).toEqual(enKeys)
  })

  it('takes the same arguments on both sides', () => {
    // `n => \`${n} vins\`` becoming `() => 'des vins'` compiles cleanly and
    // silently loses the number. Only arity catches it.
    const mismatched = enKeys.filter(k => {
      const a = (en as Bundle)[k]
      const b = (fr as Bundle)[k]
      return typeof a === 'function' && typeof b === 'function' && a.length !== b.length
    })
    expect(mismatched).toEqual([])
  })

  it('agrees on which keys are functions', () => {
    const mismatched = enKeys.filter(k =>
      typeof (en as Bundle)[k] !== typeof (fr as Bundle)[k])
    expect(mismatched).toEqual([])
  })

  it('leaves no message empty', () => {
    const empty = enKeys.filter(k => {
      const v = (fr as Bundle)[k]
      return typeof v === 'string' && v.trim() === ''
    })
    expect(empty).toEqual([])
  })

  it('actually translated the prose, rather than copying it', () => {
    // A long string identical in both languages is a forgotten translation.
    // The exemptions are named rather than handled by raising the length
    // threshold, so adding one is a decision someone makes on purpose.
    const SAME_BY_DESIGN = new Set([
      // Wine names. Proper nouns do not translate, and inventing different
      // examples per language would make the placeholder a translation
      // problem rather than an illustration of the format.
      'addPlaceholder',
    ])
    const same = enKeys.filter(k => {
      const a = (en as Bundle)[k]
      const b = (fr as Bundle)[k]
      return typeof a === 'string' && a === b && a.length > 24 && !SAME_BY_DESIGN.has(k)
    })
    expect(same).toEqual([])
  })
})

/**
 * English pluralises on n === 1. French treats 0 as singular too, which is
 * exactly the rule a shared `plural()` helper would have got wrong.
 */
describe('plural rules belong to their language', () => {
  it('English: 0 and 2 are plural, 1 is not', () => {
    expect(en.exportCount(0)).toContain('0 wines')
    expect(en.exportCount(1)).toContain('1 wine')
    expect(en.exportCount(1)).not.toContain('wines')
    expect(en.exportCount(2)).toContain('2 wines')
  })

  it('French: 0 and 1 are both singular', () => {
    expect(fr.exportCount(0)).toContain('0 vin')
    expect(fr.exportCount(0)).not.toContain('vins')
    expect(fr.exportCount(1)).toContain('1 vin')
    expect(fr.exportCount(1)).not.toContain('vins')
    expect(fr.exportCount(2)).toContain('2 vins')
  })

  it('writes prices the Quebec way', () => {
    expect(fr.priceUpTo(15)).toContain('15 $')
    expect(en.priceUpTo(15)).toContain('$15')
  })
})

describe('the language store', () => {
  beforeEach(() => {
    storage.removeItem('lang')
  })

  it('serves the bundle for the current language', () => {
    lang.setLang('fr')
    expect(lang.t().findTab).toBe('Trouver un vin')
    lang.setLang('en')
    expect(lang.t().findTab).toBe('Find a wine')
  })

  it('publishes to subscribers, once', () => {
    let calls = 0
    const unsub = lang.subscribe(() => { calls++ })
    lang.setLang('fr')
    unsub()
    expect(calls).toBe(1)
  })

  it('does not publish when the language is already current', () => {
    lang.setLang('fr')
    let calls = 0
    const unsub = lang.subscribe(() => { calls++ })
    lang.setLang('fr')
    unsub()
    expect(calls).toBe(0)
  })

  it('persists the choice', () => {
    lang.setLang('fr')
    expect(storage.getItem('lang')).toBe('fr')
  })

  /**
   * Montréal-only, so French is the language to be wrong in. English is served
   * to a browser that asks for it; a stored choice beats both.
   *
   * The detection runs once, at module load, so these reset the module and
   * import it again rather than calling initLang — which only applies a
   * language already decided. Testing it any other way would be testing the
   * mock.
   */
  describe('which language a first visit gets', () => {
    async function firstVisitWith(language: string | undefined, saved?: string) {
      vi.resetModules()
      vi.stubGlobal('navigator', language === undefined ? undefined : { language })
      const store = await import('../src/lib/storage')
      store.storage.removeItem('lang')
      if (saved) store.storage.setItem('lang', saved)
      const fresh = await import('../src/lib/lang')
      return fresh.getLang()
    }

    afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

    it('defaults to French when the browser asks for nothing in particular', async () => {
      expect(await firstVisitWith('')).toBe('fr')
    })

    it('defaults to French for a browser set to something else entirely', async () => {
      expect(await firstVisitWith('pt-BR')).toBe('fr')
    })

    it('serves English to a browser that asks for English', async () => {
      expect(await firstVisitWith('en-CA')).toBe('en')
    })

    it('serves French to a French browser', async () => {
      expect(await firstVisitWith('fr-CA')).toBe('fr')
    })

    it('lets a stored choice beat the browser', async () => {
      expect(await firstVisitWith('fr-CA', 'en')).toBe('en')
    })

    it('falls back to French when there is no navigator at all', async () => {
      expect(await firstVisitWith(undefined)).toBe('fr')
    })
  })

  it('does not throw when storage refuses the write', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => lang.setLang('fr')).not.toThrow()
    expect(lang.getLang()).toBe('fr') // the session still switches
  })
})

/**
 * The half that is easy to forget: switching the chrome without switching the
 * index leaves French labels around English wine names, regions and grapes.
 */
describe('the catalog follows the interface', () => {
  it('moves the store view with the language', () => {
    lang.setLang('fr')
    expect(catalog.getCatalogLang()).toBe('fr')
    expect(catalog.catalogHeaders()['Magento-Store-View-Code']).toBe('fr')

    lang.setLang('en')
    expect(catalog.getCatalogLang()).toBe('en')
    expect(catalog.catalogHeaders()['Magento-Store-View-Code']).toBe('en')
  })

  it('moves the category and availability values too', () => {
    lang.setLang('fr')
    const filter = catalog.buildCatalogFilter('23112', {
      colour: 'red', priceMin: null, priceMax: null,
    })
    expect(filter).toContainEqual({ attribute: 'categories', eq: 'produits/vin/vin-rouge' })
    expect(filter).toContainEqual({ attribute: 'availability_front', eq: 'En succursale' })
  })

  it('moves the product links', () => {
    lang.setLang('fr')
    expect(catalog.productUrl('14947051')).toBe('https://www.saq.com/fr/14947051')
  })
})

/**
 * The reason `wineLang` exists, stated as a test.
 *
 * score.ts intersects grape and region strings exactly, and the two indexes
 * disagree: "Cabernet sauvignon" against "Cabernet-sauvignon", "California"
 * against "Californie". A profile built from English records scored against a
 * French catalog matches on nothing but price and reports nothing at all.
 */
describe('switching language invalidates cached wine records', () => {
  beforeEach(() => {
    storage.removeItem('cellar.v2')
    lang.setLang('en')
    cellar.reload()
  })

  it('stamps a saved wine with the language it was fetched in', () => {
    cellar.saveWine(wine('111'), 'like')
    expect(cellar.getSnapshot().entries[0]!.wineLang).toBe('en')

    lang.setLang('fr')
    cellar.saveWine(wine('222'), 'like')
    expect(cellar.getSnapshot().entries[1]!.wineLang).toBe('fr')
  })

  it('treats a record from the other language as a cache miss', () => {
    cellar.saveWine(wine('111'), 'like')
    expect(hydrate.pending(cellar.getSnapshot().entries)).toHaveLength(0)

    lang.setLang('fr')

    // Still there, still shown — but due for a re-fetch rather than scored
    // against strings from the wrong index.
    expect(cellar.getSnapshot().entries).toHaveLength(1)
    expect(hydrate.pending(cellar.getSnapshot().entries)).toHaveLength(1)
  })

  it('re-fetches once, then goes quiet again', async () => {
    cellar.saveWine(wine('111'), 'like')
    lang.setLang('fr')

    const spy = vi.spyOn(catalog, 'resolveSku')
      .mockImplementation(async sku => wine(sku, { name: 'Vin français' }))
    const first = await hydrate.hydrateMissing()
    expect(first).toMatchObject({ attempted: 1, resolved: 1 })
    expect(cellar.getSnapshot().entries[0]!.wineLang).toBe('fr')

    spy.mockClear()
    const second = await hydrate.hydrateMissing()
    expect(second.attempted).toBe(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not let an unresolved mark survive a language switch', () => {
    // "This SKU does not exist" was an answer about the English index. The
    // French one is a different question.
    cellar.replaceAll([
      { sku: '111', kind: 'like', addedAt: 1, wine: wine('111'), wineFetchedAt: 1, wineLang: 'en', unresolvedAt: 5 },
    ])
    lang.setLang('fr')
    expect(hydrate.pending(cellar.getSnapshot().entries)).toHaveLength(1)
  })

  it('leaves a record with no language at all due for a re-fetch', () => {
    // Written before wineLang existed. One re-fetch, then it is stamped.
    cellar.replaceAll([
      { sku: '111', kind: 'like', addedAt: 1, wine: wine('111'), wineFetchedAt: 1 },
    ])
    expect(hydrate.pending(cellar.getSnapshot().entries)).toHaveLength(1)
  })

  it('does not lose the list, only the cached records', () => {
    cellar.saveWine(wine('111'), 'like')
    cellar.saveWine(wine('222'), 'dislike')
    lang.setLang('fr')

    // The precious half is untouched; only the disposable half went stale.
    expect(cellar.getSnapshot().refs).toEqual([
      { sku: '111', kind: 'like' },
      { sku: '222', kind: 'dislike' },
    ])
  })
})

/**
 * Composition, not lookup: these files write sentences, so French needs its
 * own conjunction, its own elision, and its own frames.
 */
describe('generated prose follows the language', () => {
  const profile = {
    seeds: [wine('111', { name: 'Duas Quintas', grapes: ['Syrah'], region: 'Douro' })],
    grapes: { Syrah: 1 }, regions: ['Douro'], countries: ['Portugal'],
    appellations: [], tasteTags: [], medianPrice: 20,
  }
  const scored = {
    wine: wine('900', { grapes: ['Syrah'], region: 'Douro', country: 'Portugal' }),
    total: 50,
    components: [
      { kind: 'grape' as const, points: 30, detail: ['Syrah'] },
      { kind: 'region' as const, points: 15, detail: ['Douro'] },
      { kind: 'country' as const, points: 5, detail: ['Portugal'] },
    ],
  }

  it('writes the reason in English', () => {
    lang.setLang('en')
    const text = reasons.describeMatch(scored, profile)
    expect(text).toContain('Shares Syrah with your Duas Quintas')
    expect(text).toContain('Also from Douro')
  })

  it('writes the reason in French', () => {
    lang.setLang('fr')
    const text = reasons.describeMatch(scored, profile)
    expect(text).toContain('Partage Syrah avec votre Duas Quintas')
    expect(text).toContain('Même provenance : Douro, Portugal')
  })

  it('sidesteps the preposition rather than guessing it', () => {
    // "Also from X" needs de/du/de la/des, chosen from the gender of the place
    // and whether it takes an article — none of it derivable from the string,
    // across hundreds of regions. A label frame is correct for every value;
    // a guessed preposition is wrong for many and obviously so to a reader.
    lang.setLang('fr')
    for (const place of ['Portugal', 'France', 'Rioja', 'Pouilles', 'Italie']) {
      const one = {
        ...scored,
        components: [{ kind: 'country' as const, points: 5, detail: [place] }],
      }
      const text = reasons.describeMatch(one, profile)
      expect(text).toBe(`Même pays : ${place}.`)
      expect(text).not.toMatch(/\bde |du |des /)
    }
  })

  it('joins a list with "et", not "and"', () => {
    lang.setLang('fr')
    const two = {
      ...scored,
      components: [{ kind: 'grape' as const, points: 30, detail: ['Syrah', 'Grenache'] }],
    }
    expect(reasons.describeMatch(two, profile)).toContain('Syrah et Grenache')
  })

  it('writes the prompt in the interface language', () => {
    const seeds = [wine('111', { name: 'Duas Quintas' })]
    const filters = { colour: 'red' as const, priceMin: 15, priceMax: 30 }

    lang.setLang('en')
    const enPrompt = prompt.buildPrompt(seeds, [], seeds, 'Marché Central', filters)
    expect(enPrompt).toContain('I like these wines:')
    expect(enPrompt).toContain('red wines, $15–30')
    expect(enPrompt).toContain('Which three should I buy')

    lang.setLang('fr')
    const frPrompt = prompt.buildPrompt(seeds, [], seeds, 'Marché Central', filters)
    expect(frPrompt).toContain("J'aime ces vins :")
    expect(frPrompt).toContain('vins rouges, 15–30 $')
    expect(frPrompt).toContain('Lesquels trois devrais-je acheter')
  })
})
