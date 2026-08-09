import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * The landing page is static HTML with one inline script, so it is checked as
 * a document rather than exercised as a component. What matters here is what
 * it does NOT do: reach the network, ship the app bundle, or strand a
 * returning visitor.
 */

const landing = readFileSync('index.html', 'utf8')
const app = readFileSync('app/index.html', 'utf8')

describe('the returning-visitor redirect', () => {
  it('is inline and synchronous, so the landing never flashes', () => {
    const head = landing.slice(0, landing.indexOf('</head>'))
    expect(head).toContain('location.replace')
    // A deferred or module script would paint the landing first and then yank
    // it away, which is worse than not redirecting at all.
    expect(head).not.toMatch(/<script[^>]*\b(defer|async|type="module")/)
  })

  it('keys off the cellar, not a flag it would have to keep in sync', () => {
    expect(landing).toContain("localStorage.getItem('cellar.v2')")
  })

  it('replaces rather than pushes, so Back does not bounce', () => {
    expect(landing).toContain("location.replace('/app/')")
    expect(landing).not.toContain("location.assign('/app/')")
  })

  it('survives a browser that denies storage', () => {
    // Reading localStorage throws outright in some configurations, and an
    // uncaught throw here would leave a blank page rather than a landing.
    const script = landing.slice(landing.indexOf('<script>'), landing.indexOf('</script>'))
    expect(script).toContain('try')
    expect(script).toContain('catch')
  })

  it('has an escape hatch, so the app can get back here at all', () => {
    // The redirect exists to keep returning visitors out of the marketing
    // page. Without `?stay` the app's own way back would bounce off it,
    // because having a saved list is exactly what triggers the redirect.
    expect(landing).toContain("location.search.includes('stay')")
    expect(app).toMatch(/href="\/\?stay/)
  })
})

describe('what the landing does not ship', () => {
  it('pulls no app JavaScript', () => {
    // The landing is the URL that gets posted; it should not carry the app.
    // The language switch is inline and a few lines long, not a bundle.
    expect(landing).not.toContain('/src/ui/')
    expect(landing).not.toMatch(/<script[^>]+src=/)
  })

  it('requests nothing from a third party', () => {
    // An app whose whole argument is "nothing is sent anywhere" cannot open
    // the page by telling a font CDN that you opened it.
    const urls = [...landing.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map(m => m[1])
    expect(urls).toEqual([])
  })

  it('links only to local assets and its own routes', () => {
    // Both stylesheets: the design links Caprasimo and Figtree from Google
    // Fonts, and the app's whole argument is that nothing is sent anywhere.
    // The faces are declared in the font stack and simply do not resolve until
    // someone self-hosts the files.
    for (const path of ['src/landing.css', 'src/styles.css']) {
      const css = readFileSync(path, 'utf8')
      expect(css, path).not.toContain('@import url(http')
      expect(css, path).not.toContain('fonts.googleapis')
      expect(css, path).not.toContain('fonts.gstatic')
    }
  })

  it('needs no webfont at all', () => {
    // The design sets prose in Georgia and everything structural in the
    // platform monospace. Both ship with every OS, so there is nothing to
    // fetch and nothing to self-host — the privacy claim needs no asterisk.
    for (const path of ['src/landing.css', 'src/styles.css']) {
      const css = readFileSync(path, 'utf8')
      expect(css, path).toContain('Georgia')
      expect(css, path).toContain('ui-monospace')
      expect(css, path).not.toMatch(/@font-face|Caprasimo|Figtree/)
    }
  })
})

describe('the structure carried over from the design', () => {
  const sections = ['id="how"', 'id="privacy"', 'id="about"']

  for (const id of sections) {
    it(`has the ${id} section the nav points at`, () => {
      expect(landing).toContain(id)
      expect(landing).toContain(`href="#${id.slice(4, -1)}"`)
    })
  }

  it('lists five steps', () => {
    expect(landing.match(/class="step[ "]/g) ?? []).toHaveLength(5)
  })

  it('offers the app from the head, the hero and the foot', () => {
    expect(landing.match(/href="\/app\/"/g) ?? []).toHaveLength(3)
  })
})

describe('the About note', () => {
  it('says the data never leaves the browser', () => {
    expect(landing).toContain('never leaves')
  })

  it('says it is unofficial and unaffiliated', () => {
    expect(landing).toMatch(/unofficial/i)
    expect(landing).toMatch(/not affiliated with/i)
  })

  it('says it is Montréal only', () => {
    expect(landing).toMatch(/Montréal branches only/i)
  })

  it('is reachable from the app, through the wordmark', () => {
    // The app used to carry an "About this project" link. The wordmark is the
    // way back now — the same gesture the landing's own brand makes — so what
    // matters is that a route exists, not that a particular label does.
    expect(app).toMatch(/<a class="brand" href="\/\?stay"/)
    expect(landing).toContain('id="about"')
  })
})

describe("Task 10's stated requirements", () => {
  const css = readFileSync('src/landing.css', 'utf8')

  it('is dark, like the app', () => {
    // Not a preference being honoured: the app has no light palette, so a
    // landing that followed the OS would open a cream page into an espresso
    // one. The pages move together or not at all.
    expect(css).toContain('color-scheme: dark')
    expect(css).not.toContain('prefers-color-scheme')
  })

  it('grounds both pages on the same colour', () => {
    // The flash this prevents is between two files, so neither file can catch
    // it alone.
    const ground = (text: string) => /--ground:\s*(#[0-9a-f]{6})/i.exec(text)?.[1]
    const app = readFileSync('src/styles.css', 'utf8')
    expect(ground(css)).toBe(ground(app))
  })

  it('tints the browser chrome to match, on both pages', () => {
    const meta = (html: string) => /name="theme-color" content="(#[0-9a-f]{6})"/i.exec(html)?.[1]
    const app = readFileSync('src/styles.css', 'utf8')
    expect(meta(landing)).toBe(meta(readFileSync('app/index.html', 'utf8')))
    expect(meta(landing)).toBe(/--ground:\s*(#[0-9a-f]{6})/i.exec(app)?.[1])
  })

  it('has no motion to gate', () => {
    // The design gives this page no transitions or animations at all, so there
    // is nothing to put behind a preference — and nothing that ignores one.
    expect(css).not.toMatch(/@keyframes|animation:|transition:/)
  })

  it('is responsive rather than fixed to the design canvas width', () => {
    expect(css).toContain('@media (min-width:')
    expect(css).not.toContain('width: 1280px')
  })
})

describe('the manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))

  it('opens the app, not the landing, when installed', () => {
    expect(manifest.start_url).toBe('/app/')
  })

  it('keeps scope at the root so the landing stays in the installed app', () => {
    expect(manifest.scope).toBe('/')
  })
})


/**
 * Both languages ship in the markup and CSS hides the one that is not current.
 * That is what lets a static page switch language with no request, no
 * dictionary and no re-render.
 */
describe('the language switch', () => {
  const css = readFileSync('src/landing.css', 'utf8')

  it('carries every string in both languages', () => {
    const en = (landing.match(/data-lang="en"/g) ?? []).length
    const fr = (landing.match(/data-lang="fr"/g) ?? []).length
    expect(en).toBeGreaterThan(15)
    expect(fr).toBe(en)
  })

  it('hides the language that is not current, from <html lang>', () => {
    expect(css).toContain("html[lang='en'] [data-lang]:not([data-lang='en'])")
    expect(css).toContain("html[lang='fr'] [data-lang]:not([data-lang='fr'])")
  })

  it('marks the active button from <html lang>, not from a class', () => {
    // One source of truth: a class the script maintained could drift out of
    // step with the language actually being displayed.
    expect(css).toContain("html[lang='en'] .langtoggle button[data-set-lang='en']")
    expect(landing).not.toMatch(/data-set-lang="[a-z]{2}"[^>]*class="[^"]*active/)
  })

  it('resolves the language before first paint', () => {
    // In <head>, not at the end of body: otherwise a French visitor sees a
    // frame of English and a correction.
    const head = landing.slice(0, landing.indexOf('</head>'))
    expect(head).toContain("localStorage.getItem('lang')")
    expect(head).toContain('navigator.language')
  })

  it('shares the language key with the app, so a choice holds across both', () => {
    const appLang = readFileSync('src/lib/lang.ts', 'utf8')
    expect(appLang).toContain("const KEY = 'lang'")
    expect(landing).toContain("localStorage.getItem('lang')")
    expect(landing).toContain("localStorage.setItem('lang'")
  })

  it('survives a browser that denies storage', () => {
    // Both inline scripts touch localStorage; neither may throw on a browser
    // that refuses it, or the page renders blank.
    const head = landing.slice(0, landing.indexOf('</head>'))
    expect(head.match(/catch/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
