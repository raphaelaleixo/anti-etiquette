import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The zero-runtime-dependency guarantee, enforced rather than asserted.
 *
 * This is the property the whole fork is built on: what ships is software, not
 * data, and it runs entirely in the visitor's browser with nothing behind it.
 * A single bare import in `src/` would quietly undo that, and it would not
 * show up as a test failure anywhere else — it would show up as a bigger
 * bundle nobody looked at.
 *
 * devDependencies are unconstrained: TypeScript, Vite, Vitest and happy-dom
 * never reach the browser.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return e.name.endsWith('.ts') ? [path] : []
  })
}

/** `import x from 'y'`, `export … from 'y'`, and `import('y')`. */
function importSpecifiers(source: string): string[] {
  const out: string[] = []
  const patterns = [
    /(?:^|\n)\s*import\s+[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[^'"\n]*from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    for (const m of source.matchAll(re)) if (m[1]) out.push(m[1])
  }
  return out
}

const isRelative = (s: string) => s.startsWith('./') || s.startsWith('../')

describe('the zero-runtime-dependency guarantee', () => {
  it('declares no runtime dependencies at all', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(pkg.dependencies ?? {}).toEqual({})
    expect(pkg.peerDependencies ?? {}).toEqual({})
  })

  it('imports nothing from node_modules anywhere in src/', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (!isRelative(spec)) offenders.push(`${file} → ${spec}`)
      }
    }
    // A bare specifier here is a package. There is no allowlist on purpose:
    // the moment one is needed, that is a decision to take deliberately, not
    // a line to slip past a test.
    expect(offenders).toEqual([])
  })

  it('imports no Node built-ins in src/, since this runs in a browser', () => {
    const offenders: string[] = []
    for (const file of sourceFiles('src')) {
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('node:')) offenders.push(`${file} → ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('reaches the network from exactly one place', () => {
    // Every other absolute URL in the app is an <a href> the user clicks.
    // If this count ever rises, the "no infrastructure" claim needs re-checking.
    const sites = sourceFiles('src').flatMap(file => {
      const hits = readFileSync(file, 'utf8').match(/\bfetch\s*\(/g) ?? []
      return hits.map(() => file)
    })
    expect(sites).toEqual(['src/lib/catalog.ts'])
  })

  it('reads no environment variables, so there is nothing to configure', () => {
    const offenders = sourceFiles('src')
      .filter(f => readFileSync(f, 'utf8').includes('import.meta.env'))
    expect(offenders).toEqual([])
  })
})
