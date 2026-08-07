# Anti-Étiquette

Name a few wines you've liked. The app reads what an SAQ branch has on the
shelf right now, ranks it against your taste, and says why each suggestion
fits.

Montréal branches only. Unofficial, and not affiliated with the Société des
alcools du Québec.

## What makes this version different

It is a **static site with no backend of any kind**. Not "a small backend" — none.

```
$ grep -rn "fetch(" src/
src/lib/catalog.ts:37:  const res = await fetch(ENDPOINT, {
```

That one call goes browser-direct to the SAQ's own CORS-open catalogue
endpoint, the same one saq.com's JavaScript uses. Everything else — your list,
your filters, your branch — lives in `localStorage` and never leaves the
machine. There is no database, no serverless function, no environment
variable, no account, and nothing to configure.

The one credential in the source — the `x-api-key` in `src/lib/catalog.ts` —
is SAQ's own storefront key, the one saq.com ships to every browser that
visits it. It is public by construction, which is why it is checked in rather
than hidden in a variable that would only pretend otherwise.

**Zero runtime dependencies.** No framework:

```json
"dependencies": {}
```

The UI is custom elements and a small rendering toolkit
(`src/ui/dom.ts`). TypeScript and Vite are build tools; nothing ships to the
browser but the app.

All four of those claims are enforced by `tests/no-dependencies.test.ts`
rather than asserted here, so they cannot quietly stop being true.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

That is the whole setup. There is no `.env` to copy, because there is nothing
to put in one.

```bash
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # → dist/
npm run preview    # serve the build
```

`npm run typecheck` exists separately and is not optional: `npm test` and
`npm run build` both pass while TypeScript is broken, which is how type errors
used to slip through.

## How it is put together

Two HTML entry points, no router. Static hosts serve `/app/` from
`app/index.html` natively, so deep links and hard reloads work with no rewrite
rule, and the landing page — the URL that gets shared — pulls none of the app
bundle.

```
index.html          landing page
app/index.html      the app shell (static markup; elements upgrade in place)
src/lib/            the brain — framework-agnostic, transferred intact
src/ui/             rendering toolkit, custom elements, sheets
```

### The data model

One `localStorage` key, `cellar.v2`, holding an insertion-ordered array:

```ts
interface CellarEntry {
  sku: string
  kind: 'like' | 'dislike' | 'skip'
  addedAt: number
  wine: Wine | null      // last known record; null = never resolved
  wineFetchedAt: number
  unresolvedAt?: number  // a lookup found nothing; suppresses per-load retries
}
```

**The SKU + kind list is precious; the cached `Wine` is disposable.** A
malformed wine record degrades one entry to a cache miss and is re-fetched
later — it never removes the entry. Corrupt JSON is copied aside to
`cellar.corrupt.<timestamp>` and never overwritten, because the list is the one
thing here that cannot be regenerated from the network. A failed write updates
memory, publishes, and surfaces on the snapshot instead of throwing.

Because a wine's full record is stored when it is added, opening the app
normally makes **no network requests at all** — `hydrate.ts` only resolves
entries with no cached record, which after an import is the only time there
are any.

### The three kinds

`like` shapes the advice. `dislike` also shapes it, as a wine to steer away
from, so it generalises to similar wines. `skip` is narrower: hide this exact
bottle and say nothing about it, for wines you have no quarrel with but would
rather not be offered again.

### Reactivity

Three stores (`cellar.ts`, `appState.ts`, `lang.ts`) with the same shape: an
identity-stable `getSnapshot()`, a `subscribe()`, and mutators that publish
from inside themselves. Sections are light-DOM custom elements extending
`StoreElement`, which subscribes on connect and unsubscribes on disconnect —
so a new section cannot be added and left unwired, and switching tabs cannot
leak a listener.

Sheets are the deliberate exception: they render once and read the DOM on
submit, so nothing can re-render a textarea someone is typing into.

### Escaping

`html` is a tagged template that escapes every interpolated value and returns
branded `Html`, which is the only thing `mount` accepts. Nested templates
compose safely; a bare string is always treated as data. `raw()` is the
explicit opt-out and **should have zero call sites** — wine names come from a
third party and the resolution table echoes typed input back into markup.

## Backing up

Your list lives in one browser. Clearing site data clears it, and on iOS
Safari script-writable storage is evicted after seven days without a visit —
so *My wines → Saved in this browser only → Export* writes a JSON file, and
Import merges it back. Merge, not replace: importing onto a device that already
has wines keeps both.

Adding the page to your Home Screen exempts it from the iOS eviction window.

## Relationship to the private version

This began as a fork of a private, two-person app backed by Firebase. That app
still exists and still runs; this is not a replacement for it and shares no
data with it. There is no migration path between the two, by choice — reading
the old database would mean shipping the Firebase SDK that dropping it saved
most of 117 KB to remove.

What carried over is the code that does the thinking: catalogue access,
parsing, scoring, the taste profile, the reason strings and the prompt. What
did not is everything that assumed a server.

## Legal

Unofficial and unaffiliated. The app does not reproduce, store or redistribute
SAQ data: each visitor's browser queries the public catalogue for that
visitor's own use, exactly as saq.com's own JavaScript does. What is
distributed here is software, not data.
