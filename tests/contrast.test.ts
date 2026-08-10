import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Colour contrast, measured rather than eyeballed.
 *
 * Three tokens in the design landed under WCAG AA and the implementation
 * reproduced them faithfully: the mono ramp at 3.9:1 carrying the smallest
 * text on the screen, the line numbers at 2.9:1, and the landing's secondary
 * prose at 4.36:1 — under the bar by a margin no one would see. None of that
 * is visible in a screenshot to someone with good eyesight on a good monitor,
 * which is exactly why it needs a number and a test rather than a review.
 *
 * The conversion below is worth reading before trusting any figure it prints.
 * The oklch matrix produces *linear* sRGB, and WCAG luminance expects the
 * gamma-encoded values a hex literal gives you. Skipping the transfer function
 * silently double-darkens every oklch token while leaving hex ones correct,
 * which reads as a plausible set of ratios that are wrong by up to 2x — and
 * wrong in the direction that invents failures.
 */

type RGB = readonly [number, number, number]

/** Linear light → the sRGB values a hex literal encodes. */
function encode(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function oklch(L: number, C: number, h: number): RGB {
  const hr = (h * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

function hex(value: string): RGB {
  const v = value.replace('#', '')
  const at = (i: number) => parseInt(v.slice(i, i + 2), 16) / 255
  return [at(0), at(2), at(4)]
}

/** WCAG 2.x relative luminance. */
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Every `--token: <colour>` in a stylesheet, resolved to sRGB. */
function tokens(path: string): Record<string, RGB> {
  const css = readFileSync(path, 'utf8')
  const out: Record<string, RGB> = {}
  const re = /--([\w-]+):\s*(?:oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)|(#[0-9a-fA-F]{6}))/g
  for (const m of css.matchAll(re)) {
    out[m[1]!] = m[5] ? hex(m[5]) : oklch(Number(m[2]), Number(m[3]), Number(m[4]))
  }
  return out
}

const AA = 4.5

describe('the conversion is right before anything is measured with it', () => {
  it('agrees with the browser on a known colour', () => {
    // oklch(0.745 0.13 35) is what Chrome resolves to #f28d73. If the transfer
    // function goes missing this drops to #e3432c and every ratio below moves.
    const [r, g, b] = oklch(0.745, 0.13, 35).map(c => Math.round(c * 255))
    expect([r, g, b]).toEqual([242, 141, 115])
  })

  it('puts white on black at 21:1 and a colour against itself at 1:1', () => {
    expect(contrast(hex('#ffffff'), hex('#000000'))).toBeCloseTo(21, 1)
    expect(contrast(hex('#83807a'), hex('#83807a'))).toBeCloseTo(1, 5)
  })
})

describe('the app palette clears WCAG AA', () => {
  const t = tokens('src/styles.css')

  /** Backgrounds that ordinary text is laid over. */
  const SURFACES = ['ground', 'sub', 'topbar', 'panel', 'panel2', 'raise', 'raise2']
  /** Everything used as a text colour. */
  const INKS = [
    'ink0', 'ink', 'ink2', 'ink3', 'mute', 'mute2', 'mute3',
    'more', 'more-ink', 'more-ink2', 'less', 'less-ink',
    'ok', 'ok-ink', 'stop', 'stop-ink',
  ]

  it.each(INKS)('--%s is readable on every surface it can land on', ink => {
    for (const surface of SURFACES) {
      const ratio = contrast(t[ink]!, t[surface]!)
      expect(ratio, `--${ink} on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
    }
  })

  it('reads the line numbers against the well they sit in', () => {
    // The gutter only ever appears inside .seedinput-panel, which is --well.
    expect(contrast(t['gutter']!, t['well']!)).toBeGreaterThanOrEqual(AA)
  })

  it('reads a button label against its own fill', () => {
    // 14px semibold is not "large text", so the 3:1 allowance does not apply.
    expect(contrast(t['on-more']!, t['more']!)).toBeGreaterThanOrEqual(AA)
    expect(contrast(t['on-ok']!, t['ok']!)).toBeGreaterThanOrEqual(AA)
    expect(contrast(t['on-stop']!, t['stop']!)).toBeGreaterThanOrEqual(AA)
  })

  it('leaves --faint for decoration only', () => {
    // Deliberately below the bar, and allowed to be: it fills the group dots
    // and nothing else — shapes that repeat a text label sitting next to them,
    // so they are never the only way to know something. The moment a rule
    // paints text with it, that stops being true and this fails.
    expect(contrast(t['faint']!, t['panel']!)).toBeLessThan(AA)
    const css = readFileSync('src/styles.css', 'utf8')
    const usedFor = [...css.matchAll(/([^{}]+)\{[^}]*color:\s*var\(--faint\)[^}]*\}/g)]
      .map(m => m[1]!.trim())
    expect(usedFor, 'a text rule started using --faint').toEqual([])
  })
})

describe('the landing palette clears WCAG AA', () => {
  const t = tokens('src/landing.css')

  it.each(['ink', 'ink2', 'mute', 'mute2', 'accent', 'ok', 'ok-ink'])(
    '--%s is readable on the page', ink => {
      const ratio = contrast(t[ink]!, t['ground']!)
      expect(ratio, `--${ink} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
    },
  )

  it('reads the call to action against its own fill', () => {
    expect(contrast(t['on-accent']!, t['accent']!)).toBeGreaterThanOrEqual(AA)
  })

  it('paints both pages on the same ground', () => {
    // The landing links straight into the app. A step in the background
    // between them would read as a load rather than a navigation.
    expect(t['ground']).toEqual(tokens('src/styles.css')['ground'])
  })
})
