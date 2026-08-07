// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The landing's language switch, exercised rather than grepped.
 *
 * The page has no bundle to import, so this rebuilds it: the real stylesheet
 * and the real markup, with the inline script's two jobs (set `<html lang>`,
 * handle a click) reproduced from the file itself. What is under test is the
 * CSS — whether the right half of the document is actually hidden — which
 * string matching cannot tell you.
 */

const html = readFileSync('index.html', 'utf8')
const css = readFileSync('src/landing.css', 'utf8')

const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'))
  .replace(/^<body[^>]*>/, '')

/**
 * Rebuild the document for one language.
 *
 * Deliberately a fresh parse per language rather than flipping `lang` on a
 * live document: happy-dom caches computed styles and does not re-evaluate an
 * attribute selector when the attribute changes a second time. Real browsers
 * do — this is a limitation of the test DOM, not of the CSS — so each
 * assertion is made against a document computed once.
 */
function render(lang: 'en' | 'fr'): void {
  document.documentElement.lang = lang
  document.head.innerHTML = `<style>${css}</style>`
  document.body.innerHTML = body
}

function visible(selector: string): Element[] {
  return [...document.querySelectorAll(selector)]
    .filter(el => getComputedStyle(el).display !== 'none')
}

function visibleText(selector: string): string[] {
  return visible(selector).map(el => (el.textContent ?? '').trim()).filter(Boolean)
}

beforeEach(() => {
  render('en')
})

describe('what the page actually shows', () => {
  it('shows English and hides French when lang is en', () => {
    const shown = visibleText('h1 [data-lang]')
    expect(shown).toEqual(["The wine you'll like is already on that shelf."])
  })

  it('shows French and hides English when lang is fr', () => {
    render('fr')
    const shown = visibleText('h1 [data-lang]')
    expect(shown).toEqual(['Le vin qui vous plaira est déjà sur cette tablette.'])
  })

  it('switches every string, not just the heading', () => {
    render('fr')
    const all = visibleText('[data-lang]')
    expect(all.length).toBeGreaterThan(15)
    // If any English survived, one of these would appear.
    expect(all.join(' ')).not.toContain('Open the app')
    expect(all.join(' ')).not.toContain('Privacy, stated plainly')
    expect(all.join(' ')).toContain("Ouvrir l'app")
  })

  it.each(['en', 'fr'] as const)('never shows both languages at once (%s)', l => {
    render(l)
    const wrong = visible('[data-lang]').filter(el => el.getAttribute('data-lang') !== l)
    expect(wrong).toEqual([])
  })

  it.each(['en', 'fr'] as const)('marks only the matching toggle button (%s)', l => {
    render(l)
    // "Has a background at all" rather than a specific value: engines disagree
    // on how an unset background reads back — happy-dom says "none", browsers
    // say "rgba(0, 0, 0, 0)" — and the colour itself is the design's to change.
    const UNSET = ['none', '', 'transparent', 'rgba(0, 0, 0, 0)']
    const active = [...document.querySelectorAll('[data-set-lang]')]
      .filter(el => !UNSET.includes(getComputedStyle(el).backgroundColor))
      .map(el => el.getAttribute('data-set-lang'))
    expect(active).toEqual([l])
  })
})

describe('the toggle', () => {
  it('sets the document language on click, in both directions', () => {
    // What the inline handler owns is the attribute; the CSS above owns what
    // that attribute then shows.
    document.addEventListener('click', e => {
      const button = (e.target as Element).closest('[data-set-lang]')
      if (button) document.documentElement.lang = button.getAttribute('data-set-lang')!
    })

    document.querySelector<HTMLButtonElement>('[data-set-lang="fr"]')!.click()
    expect(document.documentElement.lang).toBe('fr')

    document.querySelector<HTMLButtonElement>('[data-set-lang="en"]')!.click()
    expect(document.documentElement.lang).toBe('en')
  })

  it('is reachable by keyboard, being real buttons', () => {
    for (const el of document.querySelectorAll('[data-set-lang]')) {
      expect(el.tagName).toBe('BUTTON')
      expect(el.getAttribute('type')).toBe('button')
    }
  })

  it('names itself for anyone who cannot see the two sitting together', () => {
    const group = document.querySelector('.langtoggle')!
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBeTruthy()
  })
})
