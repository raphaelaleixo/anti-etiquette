/**
 * English messages, and the shape every other language must satisfy.
 *
 * Functions rather than a `t('some.key')` dictionary, for three reasons: a
 * typo is a compile error instead of a blank on screen, interpolation is just
 * an argument list instead of an invented mini-syntax, and each plural rule
 * lives beside the string it belongs to rather than in a shared helper that
 * quietly assumes English.
 *
 * That last one matters here. English pluralises on `n === 1`; French treats 0
 * as singular too, so "0 vin" and "1 vin" but "2 vins". A single `plural()`
 * helper would have got that wrong in one language or the other.
 */

const s = (n: number) => (n === 1 ? '' : 's')

export const en = {
  // ------------------------------------------------------------- chrome
  appName: 'Anti-Étiquette',
  myWinesTab: (n: number) => `My wines · ${n}`,
  findTab: 'Find a wine',
  about: 'About',
  language: 'Language',

  // -------------------------------------------------------------- kinds
  //
  // Named by what they do to results rather than by how the visitor feels.
  // "Liked / Steer clear / Don't recommend" described the gesture; these
  // describe the consequence, which is the part that was not obvious.
  kindLike: 'More like this',
  kindDislike: 'Less like this',
  kindSkip: 'Just hidden',
  kindLikeNote: 'Pulls results towards wines like these.',
  kindDislikeNote: 'Pushes results away from wines like these.',
  kindSkipNote: 'Kept out of results. No effect on your taste.',
  moveTo: (group: string) => `Move to ${group}`,
  justHideIt: 'Just hide it',
  remove: 'Remove',
  show: 'Show',
  andMore: (n: number) => `+ ${n} more`,
  savedShaping: (saved: number, shaping: number) =>
    `${saved} saved · ${shaping} shaping results`,
  emptyGroup: 'Empty group',

  // ----------------------------------------------------------- my wines
  likedEmpty: 'Add wines you have drunk and liked — not ones you are thinking of buying.',
  dislikedEmpty: 'Add a wine you did not enjoy and results will move away from it.',
  skippedNote:
    'Kept out of your results and left out of the prompt entirely. Unlike ' +
    '"Steer clear", these say nothing about your taste — no similar wine is ' +
    'pushed away on their account.',
  unresolvedSku: (sku: string) => `${sku}`,
  unresolvedTitle: 'No longer in the catalogue',
  // Deliberately makes no claim about the taste profile: an entry with no
  // cached wine is excluded from buildProfile, so "it still counts towards
  // your taste" would be false.
  unresolvedNote: 'Saved before, not found today.',
  removeSku: (sku: string) => `Remove SKU ${sku}`,
  actionsFor: (name: string) => `Actions for ${name}`,
  removeFromList: 'Remove from my wines',
  addWines: '＋ Add wines',
  goFind: 'Find a wine →',

  // ------------------------------------------------------------- backup
  backupSummary: 'Saved in this browser only',
  backupNag: ' · back it up',
  backupNote:
    'Nothing here is sent anywhere, which also means nothing here is anywhere ' +
    'else. Clearing site data removes it. On an iPhone, Safari drops it after ' +
    'seven days without a visit — adding this page to your Home Screen keeps ' +
    'it around.',
  exportCount: (n: number) => `Export ${n} wine${s(n)}`,
  importFile: 'Import a file',
  exported: (n: number) => `Exported ${n} wine${s(n)}.`,
  imported: (total: number, added: number) =>
    `Imported ${total} — ${added} new, ${total - added} already here.`,
  importSkipped: (n: number) =>
    ` ${n} unreadable entr${n === 1 ? 'y was' : 'ies were'} skipped.`,

  // --------------------------------------------------------------- find
  chooseBranch: 'Choose a branch',
  changeBranch: 'Change',
  searchButton: "Find wines I'd like here",
  emptyNoWinesTitle: "First, name a wine or two you've liked.",
  emptyNoWinesNote:
    'Matches are built from wines you already know you enjoy, so there is ' +
    'nothing to go on until there is at least one.',
  emptyNoBranchTitle: 'Now pick your branch.',
  emptyNoBranchNote:
    'Stock differs from one SAQ to the next, so the list is only worth ' +
    'anything once it knows which shelf it is reading.',
  favouritesHere: (n: number) =>
    n === 1 ? 'One of your wines is here' : `${n} of your wines are here`,
  bestMatches: 'Best matches',
  rankedAgainst: (n: number) => `ranked against your ${n} wines`,
  resultCount: (shown: number, total: number) => `${shown} shown · ${total} fit your filters`,
  lessLikeThis: 'Less like this',
  hide: 'Hide',
  noRating: 'No community rating yet',
  ratingOf: (score: number) => `${score} / 100`,
  fromReviews: (n: number) => `from ${n} reviews`,
  fromFewReviews: (n: number) => `from ${n} reviews — too few to lean on`,
  changeScope: 'Change scope',

  // ------------------------------------------------------------- search
  fetchingCatalog: "Fetching this branch's catalog…",
  fetchingPage: (done: number, total: number) => `Fetching catalog… page ${done} of ${total}`,
  searchFailed: (reason: string) => `Search failed: ${reason}`,
  couldNotSave: 'Could not save to this browser.',

  // ---------------------------------------------------------- add wines
  addTitle: 'Add wines',
  addHeading: "Name a few wines you've drunk and had an opinion about.",
  addSub:
    "Loved or hated both help. You'll sort them in the next step — not ones " +
    "you're thinking of buying.",
  onePerLine: 'One per line',
  addPlaceholder: 'Château Bonnet\nRiesling Kabinett\nChianti Classico',
  lookUp: (n: number) => `Look up ${n} wine${s(n)}`,
  lookingUp: 'Looking up…',
  reviewTitle: 'Check these matches',
  back: 'Back',
  save: (n: number) => `Save ${n} wine${s(n)}`,
  saving: 'Saving…',
  noMatch: 'no match — not added',
  nothingChosen: 'nothing chosen — not added',
  noneOfThese: 'None of these',
  whichWine: (input: string) => `Which wine ${input} means`,
  whichList: (name: string) => `Which list ${name} belongs in`,
  dismissUnmatched: (input: string) => `Dismiss the unmatched line ${input}`,
  dismissMatched: (name: string) => `Do not add ${name}`,
  fromInput: (price: string, input: string) => `${price} · from "${input}"`,
  linesIgnored: (n: number) => `${n} line${s(n)} ignored · `,
  batchSummary: (liked: number, steered: number) => `${liked} liked, ${steered} steered clear`,
  batchSkipped: (n: number) => `, ${n} never recommended`,
  catalogUnreachable: (reason: string) => `Could not reach the SAQ catalog: ${reason}`,

  // ------------------------------------------------------------ branches
  branchTitle: 'Which branch?',
  branchFilter: (n: number) => `Filter ${n} Montréal branches`,
  branchFilterLabel: 'Filter branches',
  recent: 'Recent',
  allBranches: 'All branches · A–Z',
  noBranchMatch: 'No Montréal branch matches that.',
  useBranch: (name: string) => `Use ${name}`,
  useBranchEmpty: 'Use branch',
  montrealOnly: (n: number) => `Montréal branches only — ${n} of them.`,
  inStockAt: (n: number) => ` · ${n} in stock`,

  // ------------------------------------------------------------- filters
  filtersTitle: 'Filters',
  reset: 'Reset',
  colour: 'Colour',
  price: 'Price',
  min: 'Min',
  max: 'Max',
  any: 'Any',
  showCount: (n: number) => `Show ${n} wines`,
  showNone: 'No wines in this band',
  showWines: 'Show wines',
  colourAll: 'All',
  colourRed: 'Red',
  colourWhite: 'White',
  colourRose: 'Rosé',
  colourOrange: 'Orange',
  priceUnder: (max: number) => `Under $${max}`,
  priceBetween: (min: number, max: number) => `$${min}–${max}`,
  priceOver: (min: number) => `$${min}+`,
  priceRange: (min: number, max: number) => `$${min} – $${max}`,
  priceFrom: (min: number) => `$${min}+`,
  priceUpTo: (max: number) => `Up to $${max}`,
  anyPrice: 'Any price',
  allColours: 'All colours',
  filterSummary: (colour: string, price: string, branch: string) =>
    `${colour} · ${price} · in stock at ${branch}`,
  thisBranch: 'this branch',

  // -------------------------------------------------------------- prompt
  promptTitle: 'Prompt',
  close: 'Close',
  promptMeta: (wines: number, chars: number) => `${wines} wines available · ${chars} characters`,
  copy: 'Copy',
  copied: 'Copied ✓',
  copyManually: 'Select and copy manually',
  openChatGpt: 'Open ChatGPT ↗',
  include: 'Include',
  includeAll: 'All',
}

export type Messages = typeof en
