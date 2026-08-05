import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const root = import.meta.dirname

/**
 * Two HTML entry points, no router.
 *
 * Static hosts serve `/app/` from `app/index.html` natively, so deep links and
 * hard reloads work with no rewrite rule, and the landing — the URL that gets
 * posted — pulls none of the app bundle.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        landing: resolve(root,'index.html'),
        app: resolve(root,'app/index.html'),
      },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
