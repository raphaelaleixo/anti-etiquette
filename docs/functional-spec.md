# Anti-Étiquette — what the product does

A brief for design. This describes **functionality only**: what exists, what it
does, what states it can be in. It deliberately says nothing about how any of
it looks, and nothing about the current implementation's visual choices — those
are yours to decide.

---

## The product in one paragraph

You tell it a few wines you have drunk and had an opinion about. It reads what
a specific SAQ branch has on the shelf right now, ranks that inventory against
your taste, and tells you which bottles to consider and why. It can also write
a text summary of your taste and the shelf, for pasting into an AI chat.

Everything is stored in the visitor's own browser. There is no account, no
server and no database.

---

## Who is using it, and where

Two quite different situations, and the second is currently under-served:

**In the shop, on a phone, one-handed.** Standing in an aisle, possibly holding
a bottle, under mild time pressure. This is where *Find a wine* is used. Store
lighting is bright and phone screens wash out.

**At home, on a desktop or laptop.** This is where the list gets built — typing
or pasting a batch of wine names is a keyboard task, and reviewing what they
matched is easier on a big screen. **Desktop needs to be a first-class layout,
not a stretched phone one.** Adding wines in particular should feel like it
belongs on a large screen.

First-time visitors are the normal case. The product has to explain itself to
someone who arrived from a link.

---

## Two languages

Everything exists in **English and French**, switchable at any time, on every
surface. The choice persists and is shared between the marketing page and the
app.

Switching language also changes the language of the wine data itself — names,
regions, grape varieties come back translated — so a language switch is a
content change, not just a label change.

French text runs roughly 15–25% longer than English. Every label, button and
heading needs to survive that without breaking.

---

# Surface 1 — the marketing page

The page a link points at. A visitor who already has a saved list never sees
it; they go straight to the app.

**Contains:**

- Product name and mark
- Navigation to the three sections below
- A language switch
- A call to action that opens the app (repeated at the top and bottom)
- **Headline and subheadline** — what the product does, in one sentence each
- **A reassurance line** — nothing is sent anywhere, no sign-up
- **A place for a photograph.** None exists yet.
- **"How it works" — five numbered steps**, each a short title and two or three
  lines of explanation:
  1. Name wines you have drunk
  2. Pick your branch
  3. Set your price range
  4. Take a bottle
  5. Optionally, get a second opinion from an AI
- **A privacy statement**, with three things the product explicitly does not
  do: no sign-in, no tracking, no server
- **An "About" section** — three paragraphs: what it does, that data never
  leaves the browser and what that implies, and that it is unofficial and
  unaffiliated with the SAQ
- Footer with the unaffiliated notice

---

# Surface 2 — the app

Two tabs. Which one opens first depends on whether the visitor has a saved
list: an empty list opens on **My wines**, an existing one on **Find a wine**.

**Persistent chrome, on both tabs:**

- Product name and mark
- Language switch
- A link back to the About section of the marketing page
- The tab switch itself, which shows a **count of liked wines** on the My wines
  tab
- **A status line** during a search — including progress through a
  multi-page fetch ("page 3 of 9")
- **An error line** — a failed search, or a failed save
- **A primary action area**, pinned and always reachable, whose contents change
  per tab and per state (detailed below)

---

## Tab A — My wines

The saved list. Wines are only displayed and re-filed here; adding happens in a
separate flow.

### Three groups

Every saved wine is in exactly one of three groups. **The distinction between
them is the core concept of the product** and needs to be legible at a glance:

| Group | What it means |
|---|---|
| **Liked** | Shapes recommendations *towards* similar wines |
| **Steer clear** | Shapes recommendations *away* from similar wines |
| **Don't recommend** | Hides this exact bottle and says nothing about taste |

The third group is the one people find confusing and it is the one that grows
largest over time. It currently sits collapsed.

Each group shows its own count, and an explanatory line when it is empty.

### A wine row

- Wine name
- Region, when known
- An action control that offers: move to any of the other two groups, or remove
  entirely

### An unresolvable wine

A saved wine the catalogue no longer recognises. It shows its product code, a
short note that it could not be looked up, and a way to remove it. It must not
look like a normal wine, and it must not look like an error the visitor caused.

### Backup

Because the list lives only in this browser, there is an **export** (writes a
file) and an **import** (merges a file back in, keeping what is already there).

This area also carries the honest warning that the list exists in one browser
only and can be lost. It becomes more insistent when the list is large and has
never been exported, or when the browser is blocking storage entirely.

After an export or import it reports what happened — how many were exported, or
how many were imported / already present / unreadable.

### Primary actions on this tab

- Add wines
- Go to Find a wine

---

## Tab B — Find a wine

### Before a search can run

Two things are required: at least one **liked** wine, and a **branch**. When
either is missing, the tab explains which one and offers the action that fixes
it. This is the first screen most new visitors see and it currently does very
little.

### Selecting scope

- **Branch** — one of 66 Montréal locations. Selecting one is a searchable list
  with recently-used branches surfaced first, and a remembered count of how many
  wines each branch had last time.
- **Filters** — wine colour (all / red / white / rosé / orange) and a price
  range, chosen either from preset bands or by typing bounds. While the filter
  is being edited it shows **a live count of how many wines the current
  selection would return**, so the visitor can tell before applying that a band
  is too narrow.

Both are currently modal panels. Both are summarised in a compact form when
closed, so the current scope is visible without opening anything.

### Results

Two lists, in this order:

**Wines you already saved that are stocked here.** A short list — name, price.
Pleasant surprise, not the main event.

**Best matches — ten ranked wines.** Each shows:

- Its rank
- Name, linking out to the SAQ product page
- Price
- The SAQ community rating, when it exists — **always accompanied by the number
  of reviews it is based on**, because the catalogue contains wines rated
  100/100 from three reviews
- **A one-sentence explanation of why this wine was suggested**, generated from
  the visitor's own list — e.g. "Shares Syrah with your Duas Quintas. Same
  region." This sentence is the product's main claim to being useful rather
  than arbitrary, and is currently the least prominent thing on the row.

A count of how many are shown against how many the branch has in total.

Re-filing a wine from the results (marking it steer-clear, say) updates the
list immediately without a new search.

### The AI prompt

After a search, the primary action area offers a generated text summary of the
visitor's taste and the current shelf, to paste into an AI chat.

- A control to choose **how many wines to include**: 20, 40, or all
- A preview of the text, and its length
- **Copy**, which after a successful copy makes clear the next step is to go to
  the AI chat
- A link out to ChatGPT
- If copying fails, the text becomes manually selectable instead

---

# Surface 3 — Adding wines

A distinct flow, reachable from both tabs. **This is the flow that most needs to
work well on a desktop.** Two steps, in one place, with no navigation away.

### Step 1 — name the wines

A free-text area, one wine per line. Names as remembered, not exact catalogue
names. An explanation that both loved and disliked wines are useful. A count of
how many lines have been entered updates as the visitor types.

### Step 2 — check the matches

One row per line entered. For each:

- The wine the catalogue matched
- Its price, and the text originally typed
- **When the catalogue offered several possible matches, a way to pick a
  different one, or to say none of them is right.** This matters: typing a
  varietal like "Pinot Noir" matches hundreds of wines, and the top result is
  arbitrary.
- **Which of the three groups to file it in** — defaulting to Liked
- A way to drop this line without dropping the rest

Lines that matched nothing are shown, clearly, and are not silently discarded.

A summary of what will be saved. A way to go **back** to the text — with the
typed text still there — and a way to save.

Both steps show progress while the catalogue is being queried, and any failure
to reach the catalogue is reported inside the flow.

---

# States that need designing

Easy to forget, all of them real:

- **Empty** — no wines saved at all; no branch chosen; no search run yet
- **Loading** — a catalogue fetch can take several seconds and reports paging
  progress
- **No results** — a filter band with nothing in it
- **Failure** — the catalogue is unreachable; the browser refuses to save
- **Partial** — some wines in a batch matched and others did not
- **Long content** — a wine list of 200+ entries; wine names that run to 60+
  characters; French labels ~20% longer than English

---

# Constraints that are functional, not aesthetic

These are not preferences; they are things the product cannot do:

1. **There are no per-bottle stock counts.** The product knows a wine is in
   stock at a branch, not how many bottles. Any design showing "9 in stock" is
   showing something that does not exist.
2. **No images of wines.** The catalogue is not used for imagery, and no
   product photography exists.
3. **Nothing may be loaded from a third party** — no font CDN, no analytics, no
   embedded anything. The privacy claim is the product's main argument and a
   single external request would falsify it.
4. **No accounts, no sync, no sharing.** There is nothing to design around a
   second user.
5. **Data lives in one browser and can be lost.** The design has to make the
   backup path findable without making the whole product feel fragile.
6. **Montréal branches only**, and the product should say so rather than let
   someone elsewhere discover it by failing.

---

# What I would most like a second pass to solve

Stated as problems, not solutions:

1. **Desktop.** The app is currently a phone layout centred on a wide screen.
   Adding wines and reviewing matches are genuinely better tasks on a large
   screen and should be designed for one.
2. **The three groups.** Liked / steer clear / don't recommend is the central
   idea and the least self-explanatory part of the product.
3. **The explanation sentence** on each result is the reason to trust the
   ranking, and is currently the quietest element on the row.
4. **The first-run experience.** A new visitor lands on a tab with an empty
   list and no branch. What should that screen actually be?
5. **The review step when a name is ambiguous.** Choosing between five possible
   matches for "Pinot Noir" is the moment the product either earns trust or
   loses it.
6. **The AI prompt.** It is a large block of text whose purpose is to be moved
   somewhere else. Currently it is a preview and a copy button.
