# Anti-Étiquette — current UI, for design review

A public, static web app: name wines you have liked, and it tells you which
bottle to take at your SAQ branch. Anyone can use it; each visitor has their
own list, in their own browser.

Stack: Vite + TypeScript, **no UI framework and no runtime dependencies at
all**. The UI is light-DOM custom elements over a 142-line rendering toolkit,
plus one hand-written stylesheet. The app's visual styling is inherited from
the private version it forked and is deliberately minimal scaffolding, not a
considered design — it was written to be legible while the logic was built.

A design does exist (Claude Design project `a955c614`, the "Organic" system:
cream ground, wine field for header and footer, terracotta for actions). Only
its *structure* has been implemented, on the landing page. See **Known gaps**.

## Context of use

- **Almost always on a phone, one-handed, standing in a shop aisle.** Possibly
  holding a bottle. Desktop use is occasional — setting up the list.
- **Under mild time pressure**: you are in a shop and want to leave with
  something.
- **Store lighting is bright and phone screens wash out.** Contrast matters.
- Used in short bursts, a minute or two, maybe weekly.
- **First-time visitors are now the normal case.** The private version was used
  by two people who already had the data; this one has to explain itself to
  someone who arrived from a link.

## What the app does

1. You keep three lists — **liked**, **steer clear**, **don't recommend** —
   entered by pasting names, matched against SAQ's real catalogue.
2. You pick a Montréal branch and a filter (colour, price band; in-stock is
   always applied).
3. It ranks that branch's actual inventory against your taste and shows the top
   ten, each with a sentence saying why.
4. It writes a prompt describing your taste and what is on the shelf, to paste
   into ChatGPT or similar for a final opinion.

No login, no accounts, no onboarding beyond the landing page.

## Structure

Two pages.

**`/` — landing.** Header, hero, five numbered steps, a privacy strip, an About
note, footer. Returning visitors never see it: an inline synchronous script
redirects to `/app/` when `cellar.v2` exists. Its own layout is responsive and
supports both colour schemes.

**`/app/` — the app.** A `max-width: 30rem` column, three regions:

- **Header** — title, a storage-status line, and a two-segment tab switch
  (*My wines · N* / *Find a wine*) with a sliding pill.
- **Body** — whichever tab is selected.
- **Pinned footer** — the primary action for the current tab.

### My wines

Three groups: *Liked* and *Steer clear* are always open; *Don't recommend* is a
collapsed `<details>`, since it is the list that grows and none of it is needed
to read results. Each row carries a kebab that opens a `popover` menu — three
kinds plus Remove.

Every saved SKU renders whether or not its wine record has resolved, so the
count and the rows are drawn from one list and cannot disagree. A SKU the
catalogue cannot resolve shows as an explicit greyed row with a remove button,
rather than as a permanent invisible "loading" line.

At the foot: a collapsed *Saved in this browser only* block with Export and
Import, which opens itself when the list is worth losing or when storage is
blocked.

### Find a wine

A chip row (branch, filters) over results. Before a search can run, an empty
state names what is missing and offers the action that fixes it. After one:

- **Favourites here** — a promoted card, when wines you already saved are
  stocked at this branch.
- **Best matches** — ten numbered rows: name, price, SAQ community rating with
  its review count, and a plain-language reason.

No per-row stock line: every row is in stock at the chosen branch by
construction, and the section header says so.

Sheets (add wines, branch, filters) are native `<dialog>` bottom sheets. The
prompt opens in a centred dialog with a three-state copy button.

## Interaction notes that constrain the design

- **The popover menu must be hidden before the mutation it triggers**, or the
  re-render destroys the popover's own node mid-handler. It fails as an
  occasional stuck overlay, not as an error.
- **Sheets never subscribe to app state.** They render once and read the DOM on
  submit, because a textarea being typed into cannot sit in a subtree that
  something else may re-render.
- **`writeText` must be the first statement in the copy handler.** Safari
  rejects clipboard writes on a consumed user activation.
- **Wine names are third-party strings** and typed input is echoed back into
  markup, so every interpolation is escaped by default.

## Known gaps, for the designer

1. **The app is still on the old dark theme.** The new design's app screens are
   a light cream ground with a wine header and terracotta actions; adopting it
   means rewriting `src/styles.css`, which currently transfers unchanged from
   the private version.
2. **The design is written in French, with an FR/EN toggle.** The app has no
   i18n layer, and a toggle implies building one. Language has not been decided.
3. **Webfonts.** The design specifies Caprasimo and Figtree, linked from Google
   Fonts. They must be self-hosted before they can ship: a page whose argument
   is "nothing is sent anywhere" cannot announce each visit to a font CDN.
4. **The mark exists only as CSS shapes** (design variant 4c — black bottle,
   white label, red X clipped inside the label). No SVG or icon set has been
   produced, and the current favicon and app icons are the private version's.
5. **Dark mode in the app has never been reviewed on a real device** in shop
   lighting, which is the condition that actually matters.
