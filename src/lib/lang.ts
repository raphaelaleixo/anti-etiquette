import { storage } from './storage'
import { setCatalogLang } from './catalog'
import { en } from './i18n/en'
import { fr } from './i18n/fr'
import type { Messages } from './i18n/en'
import type { SeedKind } from './types'

/**
 * The interface language.
 *
 * A third store with the same publish shape as `cellar` and `appState`, so a
 * `StoreElement` can take it as a source without caring which it is.
 *
 * It is not only the interface, though: the SAQ runs one search index per
 * store view, and switching the UI without switching the catalog would leave
 * French chrome around English wine names, regions and grape varieties. So
 * setting the language sets the store view too, in the same call — which is
 * the whole reason `catalog.ts` keeps those values in one table.
 */

export type Lang = 'en' | 'fr'

const KEY = 'lang'
const LANGS: readonly Lang[] = ['en', 'fr']
const MESSAGES: Record<Lang, Messages> = { en, fr }

function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v)
}

/**
 * A first visit follows the browser; after that the choice is the user's.
 *
 * Montréal is genuinely bilingual, so neither language is the obviously
 * correct default — `navigator.language` is the only honest signal available
 * before anyone has expressed a preference.
 */
function detect(): Lang {
  try {
    const saved = storage.getItem(KEY)
    if (isLang(saved)) return saved
  } catch {
    // Storage denied. Fall through to the browser's own setting.
  }
  try {
    const nav = globalThis.navigator?.language ?? ''
    return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  } catch {
    return 'en'
  }
}

let current: Lang = detect()
const listeners = new Set<() => void>()

/** The message bundle for the current language. */
export function t(): Messages {
  return MESSAGES[current]
}

export function getLang(): Lang {
  return current
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/**
 * Reflect the language on the document.
 *
 * `<html lang>` is not decoration: screen readers pick their voice from it,
 * and hyphenation and quote marks follow it.
 */
function applyToDocument(lang: Lang): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    storage.setItem(KEY, lang)
  } catch {
    // A lost preference is not worth interrupting the user for; the session
    // still switches.
  }
  // One call moves the catalog with the chrome. Splitting these is how you get
  // French labels over English wine names.
  setCatalogLang(lang)
  applyToDocument(lang)
  for (const fn of [...listeners]) fn()
}

/** Called once at startup: the detected language has not been applied yet. */
export function initLang(): void {
  setCatalogLang(current)
  applyToDocument(current)
}

/**
 * The three kinds, in the current language.
 *
 * `KIND_LABEL` in `types.ts` is the English vocabulary and stays there as the
 * canonical list; this is the translated view of it. Keeping the mapping here
 * rather than adding a language argument to `types.ts` keeps the data layer
 * unaware of the interface, which is the line the rest of `lib/` holds too.
 */
const KIND_KEY: Record<SeedKind, 'kindLike' | 'kindDislike' | 'kindSkip'> = {
  like: 'kindLike',
  dislike: 'kindDislike',
  skip: 'kindSkip',
}

export function kindLabel(kind: SeedKind): string {
  return t()[KIND_KEY[kind]]
}
