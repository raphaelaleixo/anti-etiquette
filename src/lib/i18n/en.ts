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
  myWines: 'My wines',
  exportBackup: 'Export a backup',
  importShort: 'Import',
  aboutProject: 'About this project',
  alsoHere: 'Also here: wines you already know',
  alsoHereNote: 'From your own list, in stock at this branch.',
  askAnAi: 'Ask an AI about this shelf',
  ranksContinue: (from: number, to: number) => `Ranks ${from} – ${to} continue`,

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
  startHere: 'Start here',
  emptyListBegin: 'Your list is empty. Three wines is enough to begin.',
  emptyListHow:
    'Type the names of wines you have drunk and had an opinion about — as you ' +
    'remember them, not as the catalogue spells them.',
  importBackup: 'Import a backup file',
  whatYouGetBack: 'What you get back',
  exampleReason: '"Shares Syrah with your Duas Quintas. Same region."',
  everyExplained:
    'Every suggestion is explained in a sentence built from your own list. ' +
    'Nothing is ranked by a number you cannot see.',
  threePlaces: 'Every wine you save goes in one of three places',
  moveAnyTime: 'You can move a wine between them at any time.',
  staysInBrowser: 'Your list stays in this browser. Nothing is sent anywhere.',
  keepACopy: 'Keep a copy',
  keepACopyWhy:
    'Your list is in this browser and nowhere else — that is the whole privacy ' +
    'promise, and its one cost.',
  importMerges: 'Importing merges into what you already have. Nothing is replaced.',
  worthDoingNow: 'Worth doing now',
  noBackupYet: (n: number) => `${n} wines, no backup yet`,
  notNow: 'Not now',
  nothingCanBeSaved: 'Nothing can be saved',
  storageBlockedWhy:
    'This browser will not let the page store anything — usually private ' +
    'browsing, or storage blocked for this site.',

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
  stepName: '1 · Name them',
  stepCheck: '2 · Check the matches',
  closeWithoutSaving: 'Close without saving',
  reviewHeading: 'Check what the catalogue found',
  reviewTally: (matched: number, ambiguous: number, missing: number) =>
    [
      matched > 0 && `${matched} matched cleanly.`,
      ambiguous > 0 && `${ambiguous} need${ambiguous === 1 ? 's' : ''} a decision.`,
      missing > 0 && `${missing} found nothing.`,
    ].filter(Boolean).join(' '),
  linesWillSave: (lines: number, saving: number) => `${lines} lines · ${saving} will be saved`,
  colYouTyped: 'You typed',
  colMatch: 'Catalogue match',
  colFileIn: 'File it in',
  otherMatches: (n: number) => `${n} other match${n === 1 ? '' : 'es'}`,
  needsDecision: 'Needs a decision',
  manyMatch: (n: number) => `${n} wines match that name. Which one did you drink?`,
  pickOrDrop: 'Pick one, or drop the line',
  showingOf: (shown: number, total: number) => `Showing ${shown} of ${total} matches, closest first.`,
  noneDropLine: 'None of these — drop this line',
  keepsTheRest: (n: number) => `Keeps the other ${n}`,
  foundNothing: (n: number) => `Found nothing — ${n} line${n === 1 ? '' : 's'}`,
  notSavedNotThrown: 'Not saved, not thrown away',
  editTheText: 'Edit the text',
  dropIt: 'Drop it',
  foundNothingWhy:
    'Producers the SAQ does not carry, and vintages it has sold out of, will not ' +
    'be found. Nothing is wrong with your list.',
  backToText: 'Back to the text',
  tally: (like: number, dislike: number, skip: number) =>
    `${like} more like this · ${dislike} less · ${skip} hidden`,

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
  narrowTheShelf: 'Narrow the shelf',
  winesFit: (n: number) => `${n} wines fit your filters`,
  thinBand: 'That is a thin band — widen it a little for a better ranking.',
  searchTheseWines: (n: number) => `Search these ${n} wines`,
  resetFilters: 'Reset to all colours, any price',
  branchSearchPlaceholder: 'Name or street',
  lastTime: 'last time',
  whichShop: 'Which shop are you standing in?',
  winesReadyNoBranch: (n: number) => `${n} wines ready. No branch yet.`,

  // -------------------------------------------------------------- prompt
  promptTitle: 'Prompt',
  secondOpinion: 'Get a second opinion',
  promptExplain: (branch: string) =>
    `This writes up your taste and what is on the shelf at ${branch} as plain ` +
    `text. Paste it into any AI chat and argue with it.`,
  topN: (n: number) => `Top ${n}`,
  allN: (n: number) => `All ${n}`,
  characters: (n: number) => `${n} characters`,
  stepCopy: 'Step 1 — copy',
  stepPaste: 'Step 2 — paste in a chat',
  copySummary: 'Copy the summary',
  copiedChars: (n: number) => `Copied — ${n} characters`,
  nowOpenChat: 'Now open a chat and paste it in.',
  onClipboard: 'It is on your clipboard. Ask which of these you would actually enjoy, and why.',
  copyAgain: 'Copy again',
  clipboardRefused:
    'This browser would not let the page copy for you. The text is selectable — ' +
    'take it by hand.',
  selectInstead: 'Select the text instead',
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
