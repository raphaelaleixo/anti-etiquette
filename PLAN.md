# Public fork: a static, dependency-free SAQ wine matcher

## Context

`saq-wine-matcher` is a private tool for two people: a Firebase-backed shared list, a Vercel
function proxying SAQ for stock counts, React, and 66 Montréal stores. The goal is a **separate
repo, using this app as its base**, that anyone can use — each visitor builds their own taste
profile and searches their own branch.

Three decisions shape it.

**1. No server, for a reason.** SAQ's terms
([saq.com/en/legal-aspects](https://www.saq.com/en/legal-aspects)) say data from the site is
"for **individual use** and may not be reproduced or distributed," and forbid "reproduction,
distribution, transmission or **public communication**" without written authorization. Those
clauses describe *the operator* moving SAQ's data to third parties. They say nothing about
automated access, and `robots.txt` (71 `Disallow` lines) does not cover the endpoints used.

Today only `/api/stock` puts us in that data path; the catalog, search, filtering and wine
resolution already run browser-direct against the CORS-open `catalog-service.adobe.io`. Deleting
that one endpoint makes the app a **pure static client** — each user's browser consults saq.com
for that user's own individual use, exactly as the site's own JS does. We distribute software,
not data. *Not a legal clearance; a materially better posture. Publishing stays your call.*

**2. No runtime dependencies.** Vanilla TypeScript, no UI framework — custom elements are a
platform API and ship zero bytes, so they count as vanilla, not as a framework. Measured split of
the existing code:

| | Lines | Fate |
|---|---|---|
| `src/lib/` — catalog, parse, score, profile, prompt, reasons | **700** | **transfers unchanged** |
| `src/components/` + `App.tsx` | **1484** | rewritten |
| Tests | **129, all pure-function** | **109 transfer unchanged** |

Measured 2026-08-05 against the source repo, not estimated. Of the 20 tests that don't transfer,
8 are `stock.test.ts` and 12 exercise the Firebase wire layer in `seeds.ts` that `cellar.ts`
replaces. Two test files — `filters.test.ts` and `resolution.test.ts` — import pure functions
that currently live inside `.tsx` component files; Task 1 relocates those to `src/lib/`.

The brain of the app is already framework-agnostic. Bundle goes from 117KB gzipped (React +
Firebase + app) to roughly **10KB**.

**3. localStorage, per visitor.** No database, no accounts, no sync.

The cost of (1) is exact bottle counts — `in_stock_in_store` is a boolean, so there's no
client-side substitute for "7 in stock." That also deletes the 10+F concurrent-request burst,
the slowest phase of a search.

## Scope

- Separate repo, this app as the base. The original keeps React, Firebase and `/api/stock`.
- Montréal only (66 stores), with the branch sheet saying so.
- Each visitor's list is private, in their own browser.
- Designed landing at `/`, app at `/app`.

## Infrastructure: none

Verified by enumerating every network call in `src/`. After deleting `stock.ts` and `firebase.ts`
there is exactly **one** `fetch()` left:

```
src/lib/catalog.ts:37  →  https://catalog-service.adobe.io/graphql   (browser-direct, CORS-open)
```

Every other absolute URL is an `<a href>` the user clicks; every `import.meta.env` read lives in
`firebase.ts`. So: **no database, no serverless function, no environment variables, no secrets,
no configuration.** `vite build` emits HTML/JS/CSS/JSON and that is the whole deployment — free
on any static host, nothing to bill, nothing to rate-limit, no IP for SAQ to block.

Tooling stays: TypeScript and Vite. "Vanilla" here means no UI framework, not no build step —
this project has been bitten repeatedly by type errors slipping through (`npm test` and
`npm run build` both pass while TS is broken, which is why `typecheck` exists).

---

## Task 1 — Scaffold, and prove the core transfers

Vite + TS, **two HTML entry points, no router**:

```ts
build: { rollupOptions: { input: { landing: 'index.html', app: 'app/index.html' } } }
```

Two real files beat a router here: static hosts serve `/app/` natively so deep links work with no
rewrite rule, and the landing — the URL that gets posted — loads none of the app bundle.

Copy `src/lib/` and `tests/` across. Drop `stock.ts` and `firebase.ts`; strip `flushSync` from
`viewTransition.ts` (vanilla DOM updates are already synchronous, so the browser's second
View Transition snapshot is correct for free — that file loses its only React import). Drop
`tests/stock.test.ts`.

**Rescue the pure functions stranded in components.** `tests/filters.test.ts` and
`tests/resolution.test.ts` import from `src/components/`, which is the rewritten column — copy
`src/lib/` alone and they fail to resolve. Move `DEFAULT_FILTERS`, `filtersEqual` and
`chipSummary` to `src/lib/filters.ts`, and `dismissAt` to `src/lib/resolution.ts`; both test files
then transfer with an import-path change and nothing else. This is cleanup the rewrite needs
anyway — the components holding them are deleted — done where it costs nothing.

`hiddenSkus` and its 3 tests seed `src/lib/cellar.ts` and `tests/cellar.test.ts`, the module that
replaces `seeds.ts`. Task 3 fills both out. The other 12 tests in `seeds.test.ts` cover
`subscribeSeeds`/`addSeed`/`removeSeed` against a mocked Firebase and are deleted with the wire
layer.

**Gate: `npm run typecheck && npm test` green with 109 tests and no UI at all.** If the core
doesn't stand alone, everything after this is built on sand.

## Task 2 — `src/ui/dom.ts`, the whole rendering toolkit

~90 lines, and the most important file in the rewrite.

```ts
export function esc(v: unknown): string
/** Branded safe markup. Only html() and raw() make it; only mount() takes it. */
export interface Html { readonly __raw: string }
/** Tagged template. Interpolated values are escaped; interpolated Html is not. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Html
/** Explicit, greppable opt-out — for external safe markup, NOT for nesting. */
export function raw(markup: string): Html
export function mount(host: HTMLElement, markup: Html): void
/** One listener on the host, matched by selector — survives innerHTML replacement. */
export function delegate(host, type, selector, fn): void
/** Light-DOM custom element base: subscribes on connect, unsubscribes on disconnect. */
export abstract class StoreElement extends HTMLElement {
  protected abstract sources(): Array<(fn: () => void) => () => void>
  protected abstract render(): void
}
```

`StoreElement` is the only concession to a component model, and it is ~15 lines: hold the
unsubscribe thunks from `sources()`, call them in `disconnectedCallback`, `render()` on connect
and on every published change. Subclasses implement two methods and nothing else — no attribute
observers, no property accessors, no `attributeChangedCallback`. Sections that need to react to
an attribute change re-read it in `render()`.

**`html` returns `Html`, not `string`.** An earlier draft returned a string, which made nested
templates indistinguishable from user data and so required `raw()` at every nesting site. That
defeats the point: a `raw()` on every list row is not an audit trail, it is noise hiding the one
call that matters. Branding the return type makes composition safe by construction and leaves
`raw()` for genuinely external markup — of which this app has none, so `grep 'raw('` should return
zero hits in `src/` outside `dom.ts`. That zero is the security property, and it is checkable.

**`html` escaping by default is non-negotiable, and it is a real regression to guard against.**
React escaped interpolated text for free. Wine names, regions and appellations are third-party
strings from SAQ's catalog, and `ResolutionTable` echoes the user's own typed input back into
markup (`from "{r.input}"`). Plain `innerHTML` would execute a name containing markup. Making
escape the default and `raw()` the explicit, greppable exception is the structural fix; per-call
discipline is not.

**Event delegation, not per-node listeners.** Handlers bind once to a section host and match on
`[data-act]`, so a full `innerHTML` re-render of that section can't orphan them.

Tests: escaping of `<`, `>`, `&`, `"`, `'`; nested `html` composition; that a raw `<script>`
in a wine name renders inert; that delegation survives a re-render; that a `StoreElement`
unsubscribes from every source when removed from the document.

## Task 3 — `src/lib/storage.ts` and `src/lib/cellar.ts`

`storage.ts` is a thin seam over `localStorage` so the data layer tests in `environment: 'node'`
with no DOM:

```ts
export const storage: StorageLike        // real, or in-memory when the browser denies it
export function isPersistent(): boolean  // false => the list won't survive a reload
export function onExternalChange(key: string, cb: () => void): () => void
```

`localStorage.getItem('branch')` currently runs during render (`App.tsx:68`) — a throw there is a
white screen. Route the branch/filter/recents prefs through this too.

`cellar.ts` replaces `seeds.ts`. One key, `cellar.v2`, holding the whole document as an
insertion-ordered array. Per-key writes existed only so two phones couldn't clobber each other;
that requirement is deleted.

```ts
interface CellarEntry {
  sku: string; kind: SeedKind; addedAt: number
  wine: Wine | null        // last known record; null = never resolved / failed validation
  wineFetchedAt: number
  unresolvedAt?: number    // a resolve found nothing; suppresses per-load retries
}
getSnapshot(): CellarSnapshot        // identity-stable until the next mutation
subscribe(fn: () => void): () => void
saveWine(wine, kind) · saveWines(items) · setKind(sku, kind) · removeSeed(sku)
refreshWines(wines) · markUnresolved(skus) · replaceAll(entries)
hiddenSkus(refs)                     // pure — moved byte-for-byte in Task 1, with its 3 tests
```

**Governing invariant: the SKU + kind list is precious; the cached `Wine` is disposable.** A bad
wine blob degrades one entry to a cache miss, never removes it. Corrupt JSON is quarantined to
`cellar.corrupt.<ts>`, never wiped. Quota errors never throw from a mutator — update memory,
publish, set `snapshot.error`.

**Publishing lives inside every mutator.** This is the fix for the bug the current app has, where
writes (`App.tsx:141`, `:152`, `:294`) are fire-and-forget and only reach the UI because Firebase
echoes them back. What vanilla gives up versus React is automatic *consumer* subscription — a
fixed set of wiring done once in Task 4 and visible in one file, not a per-mutation hazard.

Reads are read-modify-write against storage, not against the in-memory snapshot, so two open tabs
narrow to a sub-millisecond clobber window. Cross-tab notification comes free via
`onExternalChange`; it is notification, not merge, and last-write-wins is accepted.

Drop `addedBy`/`WHO` (write-only dead weight — never read back) and `SeedEntry` (the Firebase
wire shape). Keep `SeedKind` (with its doc comment) and `SeedRef`.

A second, smaller `appState` module with the same publish shape holds UI state: mode, branch,
filters, results, status, error.

## Task 4 — Shell, tabs, and self-subscribing sections

`app/index.html` plus `src/ui/shell.ts`. Header, mode switch, footer, sheet hosts — and the one
call that registers every custom element in `src/ui/elements/`.

**Subscribing sections are light-DOM custom elements.** `<my-wines>`, `<search-results>`,
`<app-status>` and the shell's own `<mode-switch>`, `<app-panel>` and `<app-foot>` extend
`StoreElement`, subscribing in `connectedCallback` and unsubscribing in `disconnectedCallback`.

**Sections, not rows.** An earlier draft made each row an element too, on the theory that re-filing
one wine would re-render one row instead of the list. It would not: every re-file moves a wine
*between* groups, so the parent section has to re-render regardless, and the row elements would
just be destroyed and re-upgraded on each pass. Rows are plain markup. A list of tens of rows
rebuilds in well under a frame, and this is the same "rebuild the section, don't diff" bargain the
whole design already takes.

This replaces the central subscription registry — a list of `subscribe(render)` calls made once
here — that an earlier draft of this plan put in this file. That registry's defence against a
missed subscription was that it was auditable in one place; self-subscription makes it
*structural*, since the element that renders is the element that subscribes and adding a section
cannot forget to wire it. It also unsubscribes on tab switch, which matters because mode switching
re-renders the panel host inside a view transition and a registry would leak a listener per
switch.

**No shadow DOM anywhere.** One global `styles.css`, transferring as-is. Encapsulation would mean
splitting it per component via `adoptedStyleSheets` while the document-scoped rules — the
view-transition pseudo-elements, `@starting-style`, the `prefers-reduced-motion` block — stayed
global regardless, leaving a hybrid stylesheet and a migration in exchange for isolation that
protects against nothing in a single-author app with no third-party widgets.

**An element takes an identity, not an object.** Attributes are strings, so
``html`<some-el wine="${w}">` `` yields `[object Object]`. Any element that needs a record takes
`sku=` and reads the store itself. No element needs this today — sections read the whole snapshot —
but it is the constraint that decides the question if one ever does.

`shell.ts` must `define()` all elements **before** the first `mount()` that emits their tags — an
undefined custom element parses fine and sits inert, which fails silently. One bundle, defined at
startup, so this is an ordering note rather than a hazard.

The sheets (Task 6) stay plain render-once functions. Their defining property is that they don't
subscribe, so lifecycle buys them nothing.

View transitions carry over from `viewTransition.ts`, now simpler: `startViewTransition(() =>
renderPanel())` needs no flush because the DOM is already updated when the callback returns.
Keep the two-step degradation and the `:active-view-transition-type()` probe.

The sliding pill, `@starting-style` animations, anchor-positioned popovers and the
`prefers-reduced-motion` block are CSS — `styles.css` transfers nearly as-is.

## Task 5 — My Wines, and the popover ordering rule

Three lists plus the per-row kebab (`popover` + implicit anchor from `popovertarget`).

**Mutations originating inside a popover must hide it *before* mutating.** The React version
calls the action then `hidePopover()` (`MyWines.tsx` `choose()`); in vanilla that order destroys
the popover's own DOM node mid-handler when the section re-renders. Reverse it: hide, then
mutate. Worth stating because it will not fail loudly — it will fail as an occasional stuck
overlay.

Finer render granularity would not rescue this. The kebab lives inside the row, so a row-scoped
re-render would destroy it exactly as a whole-list re-render does, and `removeSeed` takes the row
away entirely. The rule is independent of how much gets rebuilt.

The test observes the ordering through a stubbed `hidePopover`, because no headless DOM implements
the Popover API — happy-dom has none at all, and calling it throws. That is the right level:
top-layer behaviour and `popovertarget`'s implicit anchor are real-browser concerns and stay on the
manual checklist. The production call is guarded for engines without the API.

Killing the async gap deletes real surface: `skipsRevealed`, `onRevealSkipped`, all three
`*Total` props and all three "Loading N more…" lines, since `liked.length === likedTotal` now
holds unconditionally. Replace them with an explicit unresolved row (Task 7).

## Task 6 — Add-wines flow

Sheet, seed input, resolution table.

**These render once on open and read the DOM on submit — they do not subscribe to the store.**
That is the answer to the focus/scroll problem: a textarea the user is typing into must never be
inside a re-rendered subtree. Same for the filter and branch sheets (Task 8).

Resolution table gains the three-way kind picker (like / steer clear / don't recommend) already
in the base app.

## Task 7 — `src/lib/hydrate.ts`

Resolves only entries with `wine === null` — migrated, imported, or a failed add. **Empty on
virtually every load**, so the hot path makes no network calls at all.

Must include the SKU-identity check (see the bug note at the end): when resolving by SKU, verify
`found.sku === sku` or treat it as unresolved. A null resolution calls `markUnresolved`, keeps any
cached wine, and renders an explicit greyed row — *"SKU 10237458 — couldn't look this up"* with a
remove button. That row also fixes a live bug where an unresolvable SKU shows "Loading 1 more…"
forever, invisible and unremovable.

The cache is populated for free: `confirmResolutions` already holds a complete freshly-fetched
`Wine` and currently throws everything but the SKU away. Store it and wines added through the UI
never need hydration.

## Task 8 — Search, results, branch and filter sheets, prompt

`search()` minus the stock phase. Results, favourites, the 20/40/All control, the prompt dialog
with its three-gesture copy flow (`writeText` must remain the first statement in its handler —
Safari rejects it on a consumed user activation, which is a bug this project already shipped once).

**Do not** replace the stock line with "at this branch": `buildCatalogFilter` already pins
`availability_front == 'In store'` and `store_availability_list == branch`, so every row is
in-store by construction and the header already reads "N of M in stock." Delete the line and let
`<Rating>` stand alone.

Branch sheet: say Montréal-only, and exclude the two trade-only depots currently selectable
(`23385`, `23390`, "Exclusivement pour les restaurateurs").

## Task 9 — Export / import

localStorage means one "clear browsing data" wipes the list.

```json
{ "format": "saq-wine-matcher.cellar", "version": 2, "exportedAt": "…", "entries": [ … ] }
```

`entries` is deliberately the persisted shape — one validator, one code path. `format` is the
discriminator, so importing an unrelated JSON errors instead of silently yielding nothing.
**Merge, not replace** (the real case is "set it up on my laptop, my phone has three wines");
imported `kind` wins, better-populated wine wins.

A `<details>` at the foot of My Wines with the honest line *"Saved in this browser only."* Add a
soft nag past 10 entries with no recent export — an unused backup feature is the same as none.
The sharper reason for the copy: **iOS Safari evicts script-writable storage after 7 days without
interaction.** Returning visitors are exempt, one-visit-then-three-weeks visitors are not. The
webmanifest already ships, so "Add to Home Screen" is a real mitigation.

## Task 10 — Landing page at `/`

Implemented from the design you supply — same flow as the last redesign: produce it in Claude
Design, I import via the DesignSync MCP and build it. Responsive, `prefers-reduced-motion`
honoured, all assets local (no CDN).

**Dark, not "both colour schemes".** That requirement was written before the app existed; the app
has no light palette, so a landing following the OS would open a cream page into an espresso one —
a flash and an inconsistency, not a preference honoured. Both pages could take the light palette
(it exists in the design system, and the light design doc is in the same project) but they would
have to take it together. A test asserts the two pages share a ground colour and a `theme-color`,
because the mismatch lives between two files and neither can catch it alone.

**Done: structure only.** The design (`Anti-Étiquette.dc.html`, project `a955c614`) was imported
and its *information architecture* built — header, hero, five steps, privacy strip, About, footer —
in English, with placeholder shapes where the mark and hero image go. Visual design and copy
language were explicitly deferred.

Three things in that design are larger than this task and need a decision before they can land:

1. **It is written in French**, with an FR/EN toggle in both the site header and the app header.
   The app built in Tasks 1–9 is entirely English and has no i18n layer. A toggle implies one.
2. **It re-skins the app, not just the landing.** The two phone screens are a light cream ground
   with a wine header and terracotta actions; the app currently ships the original near-black
   theme, and `styles.css` transferred on the strength of that. Adopting the new palette is a
   rewrite of that stylesheet, not a landing-page task.
3. **It links Caprasimo and Figtree from Google Fonts.** That cannot ship as-is: a page whose
   entire argument is "nothing is sent anywhere" must not announce each visit to a font CDN. The
   typefaces have to be self-hosted, which is a licence question as much as a build one.

The retained mark is 4c — black bottle, white label, red X clipped inside the label — drawn in CSS
in the design rather than supplied as an asset.

- Returning visitors skip it: a ~5-line inline, synchronous script checks for `cellar.v2` and
  redirects to `/app/`, so there's no flash of the landing.
- `manifest.webmanifest`: `start_url` → `/app/`.
- An About note reachable from both pages: what it does, that data never leaves the browser, that
  it is unofficial and unaffiliated with SAQ.

## Task 11 — Cold start and name matching

The two things that make the app unusable by anyone who isn't you.

**Cold start.** Arriving at `/app` with an empty list currently means landing on *Find a wine*
(`App.tsx:52`) facing a disabled button (`:259`) with no explanation, where the only way forward
is a tab you have no reason to tap. Land on `wines` when empty, `find` when not; give the find tab
a real empty state; replace the placeholder examples in `SeedInput.tsx:19` (*Duas Quintas / Villa
Antinori / Yellow Tail Shiraz* is your taste, not neutral onboarding).

**Name matching.** `resolveWineName` takes the blind top hit — `size: 1` (`catalog.ts:63`).
"Pinot Noir" silently resolves to one arbitrary bottle. Split the two jobs the one function
serves: fuzzy **name** search wants candidates; exact **SKU** hydration wants an identity check.
`searchWines(name, limit)` returns candidates and the resolution table offers alternatives. Fix
the unmatched-line handling, which currently discards the whole batch including successful
matches and doesn't restore the typed text (`ResolutionTable.tsx:73`, `App.tsx:279`).

## Task 12 — Opportunistic refresh and docs

**Migration dropped.** The plan assumed this fork replaced the private app. It does not — the
private app stays in use, so there is nothing to migrate and `scripts/export-firebase.ts` was
deleted along with the `tsx` devDependency it needed. The instruction it was written to satisfy —
*do not add a Firebase read path to the app* — is now satisfied by there being no Firebase code
anywhere, which `tests/no-dependencies.test.ts` enforces.

`search()` already downloads the branch's whole catalog; intersect with saved SKUs and
`refreshWines` for **zero extra requests**, before `buildProfile`. No TTL, no refetch-on-load —
`price` is the only cached field that both drifts and matters.

README + `docs/ui-description.md`: new data model, zero configuration, working `npm run dev`.

## Task 13 — Cleanup pass

Last, once every feature is in and green. Twelve tasks of incremental building leave things that
are individually reasonable and collectively untidy, and they are only visible from the end.

- **Duplication across the elements and sheets.** Row markup, `$${price.toFixed(2)}`, the
  set-property-after-mount dance for `disabled`/`selected`/`value`, `[...snap.refs]` copies to
  satisfy `readonly`. Some of this wants a helper in `dom.ts`; some of it is fine repeated twice
  and only worth touching at three.
- **`appState` has grown wide** — twelve fields, several of which only mean anything together
  (`results`/`favourites`/`catalog`/`profile`/`searched` are one thing). Worth looking at whether
  that is one nested value.
- **Dead or near-dead exports.** `chipSummary` vs `fullSummary`, `KINDS` vs `KIND_LABEL` usage,
  anything in `filters.ts` or `branches.ts` that turned out to have one caller or none.
- **Test overlap.** Some behaviour is now covered in three files; some helper (`wine()`,
  `entry()`) is copy-pasted into six.
- **Comment density.** Several were written to justify a decision at the time and no longer earn
  their space now that the code around them settled.

Constraints: no behaviour change, the suite stays green throughout, and the mutation-tested
invariants keep their tests. Run `/simplify` over the diff as a starting point, but treat its
output as suggestions — the escape-by-default and publish-inside-mutator patterns look like
indirection worth removing and are not.

**Done.** 141 lines added, 219 removed, across 27 files; 389 tests green throughout, and all eight
mutation tests still fail exactly the assertions they failed before.

- Widened `hiddenSkus`, `buildProfile`, `buildPrompt` and `TasteProfile.seeds` to `readonly`. The
  six `[...snapshot.refs]` copies existed only to satisfy mutable parameters that never mutated.
- `money()` and `setProp()` in `dom.ts`, replacing four hand-rolled price formats and five
  copies of query-narrow-assign. `setProp` is the boolean-attribute workaround given a name, so
  the next `disabled`/`selected`/`open` cannot invent a sixth spelling.
- `tests/helpers.ts`: one `wine()` builder replacing nine that differed only accidentally.
- **`appState` went from twelve fields to eight.** `results`/`favourites`/`catalog`/`profile`/
  `searched` are one value, `search: SearchResult | null`, because they only ever meant anything
  together — `searched: true` with `profile: null` was representable and meaningless. This
  deleted a test assertion outright: "clears results when the branch changes" needed two
  assertions when the two could disagree, and needs one now that they cannot.
- Un-exported three module-internal values; kept exported the types describing public shapes.
- Replaced plan-relative comments ("Task 7 hydrates these") with code-relative ones, and cut a
  seven-line justification in markup down to two.

No dead exports were found — 117 exports, all referenced. `saveWine` is called only by tests,
`saveWines` being what the app uses; it was kept because both are in Task 3's specified API and
it is the natural single-item form.

---

## Verification

- `npm run typecheck && npm test && npm run build` green at every task boundary.
- **Tests**: 109 transfer untouched (20 deleted — `stock.test.ts`'s 8 and 12 Firebase-layer seed
  tests). New: `dom.test.ts`
  (escaping — including that a `<script>` in a wine name renders inert), `cellar.test.ts`,
  `cellar-io.test.ts`, `hydrate.test.ts`. Two carry the most weight: *every mutator notifies
  subscribers exactly once*, table-driven — the regression test for the write-echo bug — and
  *`getSnapshot()` is identity-stable between mutations*.
- **Add `happy-dom` as a devDependency and test the render functions and custom elements.** The
  1362 rewritten lines are where the new risk concentrates, and they'd otherwise have zero
  coverage. A devDep doesn't touch the zero-runtime-dependency goal. Confirm early that happy-dom
  upgrades elements and fires `connectedCallback`/`disconnectedCallback` on
  `append`/`remove` — the lifecycle tests are worthless if it doesn't, and that's a Task 2 gate,
  not a discovery to make in Task 5.
- **No-network-on-load guarantee**: with a fully cached list, assert `hydrateMissing` resolves
  nothing. This is the behavioural statement of the whole refactor.
- **Manual, in a real browser**: clean profile, empty storage; add wines including a typo and an
  ambiguous varietal; search a branch; export, clear all site data, re-import, confirm the list
  returns; two tabs, confirm a write in one reaches the other; open a kebab popover and re-file
  from it, confirming no stuck overlay.
- **Static-only proof**: `npx serve dist`, no serverless runtime, run a full search. Same run
  checks `/` serves the landing, `/app/` deep-links directly with no rewrite rule, and a hard
  reload on `/app/` doesn't 404.
- **Landing weight**: confirm `dist/index.html` pulls none of the app bundle.
- **Zero runtime dependencies, enforced not asserted** (`tests/no-dependencies.test.ts`): the
  package declares no `dependencies` or `peerDependencies`; no file in `src/` imports a bare
  specifier or a `node:` built-in; `fetch(` appears in exactly one file; `import.meta.env` appears
  in none. This is the property the fork is built on, and a single stray import would undo it
  without failing anything else — it would show up only as a bigger bundle nobody looked at.
- **Bundle**: measure and record it; there is no target. The "~10KB" figure above was estimated
  before the code existed and the app is simply larger than the guess — 14.8KB gzipped at Task 8,
  against 117KB for React + Firebase + app. Size is an outcome to watch, not a budget to defend;
  the dependency check above is the thing that actually matters, so a bundle that grows for a
  reason is fine and one that grows because something got imported is caught by the test, not by
  reading the number.

## Out of scope

Accounts or server-side sync · all-Quebec stores (66 Montréal, decided) · a client-side router
(two entry points, decided) · any UI framework, including Preact (decided) · caching branch
catalogs in localStorage (~1 MB, different design) · edge caching or rate limiting (no server to
protect) · monetization · writing to SAQ for authorization — a separate decision, unblocked by
any of this.

---

## Separately: a bug in the current app — since fixed

**Resolved before this fork began.** The original repo carries commit `1ace1aa`, *"never
substitute a different wine when resolving by SKU"*, and `resolveWineName` now ends with
`if (/^\d+$/.test(name) && found.sku !== name) return null`. The guard transferred to this fork
with `catalog.ts` in Task 1, so Tasks 7 and 12 inherit it rather than needing to add it. The
account below is kept because it is why the check exists, and Task 11 must preserve it when it
splits the function in two.


`resolveWineName(sku)` full-text searches the SKU and returns `wines[0]` with no check that it is
the wine asked for (`catalog.ts:63-68`), and `App.tsx:113` calls it for every saved wine on every
load. Verified against the live endpoint:

```
99999999  → null (safe)
12345678  → SUBSTITUTED 12345671  Alois Lageder Gewurztraminer
000000    → SUBSTITUTED 14947051  Dalla Valle Cabernet Sauvignon
```

Your saved SKUs all resolve today, so nothing is wrong right now. But when SAQ delists one, the
next page load silently swaps a different bottle into your liked list and `buildProfile` starts
scoring against it — visible only by reading the name. One-line fix in the existing repo,
independent of this plan: verify `wines[0].sku === sku` when the input is a SKU.
