# Anti-Étiquette

**[anti-etiquette-git-main-raphaelaleixos-projects.vercel.app](https://anti-etiquette-git-main-raphaelaleixos-projects.vercel.app)**

Name a few wines you've had an opinion about. Pick the SAQ branch you're
standing in. It reads what that branch has on the shelf right now, ranks it
against your taste, and tells you why each bottle fits.

Montréal branches only. Unofficial, and not affiliated with the Société des
alcools du Québec.

## What it does

You give it wines you remember — as you remember them, not as the catalogue
spells them. "grange des pères rouge" is a perfectly good line. Wines you
disliked count for as much as wines you loved, because they push the ranking
away from a whole family of bottles.

Then you pick a branch, and it reads that branch's current stock. Not the
catalogue at large — the shelf, as it is today.

What comes back is ten bottles, ranked, and **every row says why**:

> Shares Syrah with your Duas Quintas. Same region.

That sentence is the product. Anyone can sort a shelf by rating; the useful
part is a reason built from wines you already know you like, so you can judge
for yourself whether to trust it. Nothing is ranked by a number you cannot see.

Ratings are the SAQ's own community scores, always with the review count
attached — the catalogue contains bottles rated 100/100 off three reviews, and
"100" on its own would read as the best wine in the shop.

### The three groups

Every wine you save goes in one of three places, named for what they do to
results rather than for how you felt:

- **More like this** pulls results towards similar wines.
- **Less like this** pushes them away from similar wines.
- **Just hidden** hides that exact bottle and says nothing about your taste —
  for the ones you have already bought, or already decided against.

### A second opinion

There is also a button that writes your taste and the current shelf out as
plain text, for pasting into any AI chat. It leaves; nothing comes back. That
is the only time anything about your list is meant to travel, and you are the
one carrying it.

## Privacy, and why it is structural

The claim is that nothing you do here leaves your browser. That is not a
promise about intentions — it is a property of the architecture, and the
repository is arranged so it cannot quietly stop being true.

**There is no backend.** Not a small one — none. No database, no serverless
function, no environment variable, no account, nothing to configure.

**There is exactly one network call in the whole application:**

```
$ grep -rn "fetch(" src/
src/lib/catalog.ts:37:  const res = await fetch(ENDPOINT, {
```

It goes browser-direct to the SAQ's own CORS-open catalogue endpoint — the
same one saq.com's JavaScript uses — asking about the branch you chose. Your
list, your filters and your branch live in `localStorage` and are never sent
anywhere.

**There are no runtime dependencies**, so no third-party code runs beside your
data:

```json
"dependencies": {}
```

**No analytics, no cookies, no third-party requests of any kind.**

All four claims are enforced by `tests/no-dependencies.test.ts`, which fails
the build if a second `fetch` appears, if a dependency is added, or if
anything reaches for a Node built-in. They are tested, not asserted.

The one credential in the source — the `x-api-key` in `src/lib/catalog.ts` — is
the SAQ's own storefront key, the one saq.com ships to every browser that
visits it. It is public by construction, which is why it is checked in rather
than hidden in a variable that would only pretend otherwise.

## Your list lives in one browser

That is the whole privacy promise and its one cost. Clearing site data clears
it, and on iOS Safari script-writable storage is evicted after seven days
without a visit.

So *My wines → Export* writes a small JSON file, and Import merges it back —
merges, not replaces, so bringing a laptop's list to a phone that already has
wines keeps both. Adding the page to your Home Screen exempts it from the iOS
eviction window.

## Relationship to the SAQ

Unofficial, unaffiliated, not endorsed. SAQ is a trademark of the Société des
alcools du Québec.

This was built around the SAQ's [legal
terms](https://www.saq.com/en/legal-aspects) rather than in spite of them.
Those terms say:

> Any unauthorized use of this content, including any reproduction,
> distribution, transmission or public communication is forbidden without the
> written authorization from the SAQ. Any commercial use of data or resale of
> data obtained on the SAQ's Internet site is strictly forbidden. Data received
> while consulting the SAQ.COM site are for individual use and may not be
> reproduced or distributed.

Those clauses describe an operator moving SAQ data to third parties. This
application is built so that it never becomes one:

- **Nothing is reproduced or distributed.** There is no server to hold SAQ
  data, so none is stored off-device, cached, or passed on.
- **Each visitor consults the catalogue for their own individual use**, from
  their own browser, exactly as saq.com's own JavaScript does on their behalf
  when they visit the site directly.
- **No commercial use**, which the licence below forbids — consistent with the
  terms above.
- What is distributed here is **software, not data**.

A deliberate posture, not a legal clearance.

If the SAQ would like to talk about any of this — the tool, the name, or terms
other than the ones below — the address named in their own terms is
`demandes@saq.com`, and the conversation would be welcome.

## Licence

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — read
it, change it, share it, but credit it, keep it non-commercial, and license
what you build from it the same way. Full text in [`LICENSE`](LICENSE).

The non-commercial clause is deliberate, and mirrors the SAQ's own terms on
their data. Copyright is held by the author, so if you want different terms,
ask.

## How it is built

Vanilla TypeScript. The UI is light-DOM custom elements over a small rendering
toolkit (`src/ui/dom.ts`); TypeScript and Vite are build tools and ship nothing
to the browser.

```bash
npm install
npm run dev        # http://localhost:5173

npm run typecheck  # tsc --noEmit — not optional; test and build both pass without it
npm test           # vitest
npm run build      # → dist/
```

Two HTML entry points, no router. Static hosts serve `/app/` from
`app/index.html` natively, so deep links and hard reloads work with no rewrite
rule, and the landing page — the URL that gets shared — pulls none of the app
bundle.

```
index.html          landing page
app/index.html      the app shell (static markup; elements upgrade in place)
src/lib/            catalogue access, parsing, scoring, taste profile, reasons
src/ui/             rendering toolkit, custom elements, sheets and panels
```

**State.** One `localStorage` key, `cellar.v2`, holding an insertion-ordered
array of `{ sku, kind, wine, … }`. The SKU-and-kind list is precious; the
cached `Wine` beside it is disposable — a malformed record degrades one entry
to a cache miss and is re-fetched, while corrupt JSON is copied aside to
`cellar.corrupt.<timestamp>` rather than overwritten. Because a wine's full
record is stored when it is added, opening the app normally makes no network
requests at all.

**Reactivity.** Three stores (`cellar.ts`, `appState.ts`, `lang.ts`) with the
same shape: an identity-stable `getSnapshot()`, a `subscribe()`, and mutators
that publish from inside themselves. Sections extend `StoreElement`, which
subscribes on connect and unsubscribes on disconnect, so a section cannot be
added and left unwired and switching tabs cannot leak a listener. Sheets and
panels are the deliberate exception: they render once and read the DOM on
submit, so nothing can re-render a field someone is typing into.

**Escaping.** `html` is a tagged template that escapes every interpolated value
and returns a branded `Html`, the only thing `mount` accepts. Nested templates
compose safely and a bare string is always data. `raw()` is the explicit
opt-out and has zero call sites — wine names come from a third party, and the
review table echoes typed input back into markup.
