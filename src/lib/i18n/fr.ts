import type { Messages } from './en'

/**
 * French messages.
 *
 * Typed as `Messages`, so a key that is missing, misspelled, or takes the
 * wrong arguments is a build failure rather than a gap someone notices in
 * production.
 *
 * French pluralises on `n > 1`: 0 and 1 are both singular. "0 vin", "1 vin",
 * "2 vins". Writing the rule here rather than in a shared helper is the point
 * of message functions.
 */
const s = (n: number) => (n > 1 ? 's' : '')

/** Prices are written "23,45 $" in Quebec, not "$23.45". */
const money = (n: number) => `${String(n).replace('.', ',')} $`

export const fr: Messages = {
  // ------------------------------------------------------------- chrome
  appName: 'Anti-Étiquette',
  myWinesTab: n => `Mes vins · ${n}`,
  findTab: 'Trouver un vin',
  about: 'À propos',
  language: 'Langue',
  myWines: 'Mes vins',
  exportBackup: 'Exporter une copie',
  importShort: 'Importer',
  aboutProject: 'À propos du projet',
  alsoHere: 'Aussi ici : des vins que vous connaissez',
  alsoHereNote: 'Tirés de votre liste, en tablette à cette succursale.',
  askAnAi: 'Interroger une IA sur cette tablette',
  ranksContinue: (from, to) => `Les rangs ${from} à ${to} suivent`,

  // -------------------------------------------------------------- kinds
  kindLike: 'Plus comme ça',
  kindDislike: 'Moins comme ça',
  kindSkip: 'Simplement masqués',
  kindLikeNote: 'Rapproche les résultats des vins comme ceux-ci.',
  kindDislikeNote: 'Éloigne les résultats des vins comme ceux-ci.',
  kindSkipNote: 'Écartés des résultats. Aucun effet sur vos goûts.',
  moveTo: group => `Déplacer vers « ${group} »`,
  justHideIt: 'Simplement masquer',
  remove: 'Retirer',
  show: 'Afficher',
  andMore: n => `+ ${n} de plus`,
  savedShaping: (saved, shaping) => `${saved} gardés · ${shaping} influencent les résultats`,
  emptyGroup: 'Groupe vide',
  startHere: 'Commencez ici',
  emptyListBegin: 'Votre liste est vide. Trois vins suffisent pour commencer.',
  emptyListHow:
    'Écrivez les noms de vins que vous avez bus et sur lesquels vous avez un ' +
    'avis — comme vous vous en souvenez, pas comme le catalogue les écrit.',
  importBackup: 'Importer une copie',
  whatYouGetBack: 'Ce que vous obtenez',
  exampleReason: '« Partage Syrah avec votre Duas Quintas. Même région. »',
  everyExplained:
    'Chaque suggestion est expliquée en une phrase construite à partir de votre ' +
    'propre liste. Rien n’est classé par un chiffre que vous ne voyez pas.',
  threePlaces: 'Chaque vin gardé va dans l’un de trois endroits',
  moveAnyTime: 'Vous pouvez déplacer un vin entre eux à tout moment.',
  staysInBrowser: 'Votre liste reste dans ce navigateur. Rien n’est envoyé ailleurs.',
  keepACopy: 'Gardez une copie',
  keepACopyWhy:
    'Votre liste est dans ce navigateur et nulle part ailleurs — c’est toute la ' +
    'promesse de confidentialité, et son seul coût.',
  importMerges: 'L’importation fusionne avec ce que vous avez déjà. Rien n’est remplacé.',
  worthDoingNow: 'À faire maintenant',
  noBackupYet: n => `${n} vins, aucune copie`,
  notNow: 'Plus tard',
  nothingCanBeSaved: 'Rien ne peut être enregistré',
  storageBlockedWhy:
    'Ce navigateur ne permet pas à la page de stocker quoi que ce soit — ' +
    'souvent la navigation privée, ou le stockage bloqué pour ce site.',

  // ----------------------------------------------------------- my wines
  likedEmpty: 'Ajoutez des vins que vous avez bus et aimés — pas ceux que vous pensez acheter.',
  dislikedEmpty: 'Ajoutez un vin que vous n’avez pas aimé et les résultats s’en éloigneront.',
  skippedNote:
    'Écartés de vos résultats et absents du texte pour l’IA. Contrairement ' +
    'à « À éviter », ceux-ci ne disent rien de vos goûts : aucun vin semblable ' +
    'n’est écarté à cause d’eux.',
  unresolvedSku: sku => `${sku}`,
  unresolvedTitle: 'Absent du catalogue',
  unresolvedNote: 'Gardé auparavant, introuvable aujourd’hui.',
  removeSku: sku => `Retirer le code ${sku}`,
  actionsFor: name => `Actions pour ${name}`,
  removeFromList: 'Retirer de mes vins',
  addWines: '＋ Ajouter des vins',
  goFind: 'Trouver un vin →',

  // ------------------------------------------------------------- backup
  backupSummary: 'Gardé dans ce navigateur seulement',
  backupNag: ' · faites une copie',
  backupNote:
    'Rien n’est envoyé ailleurs, ce qui veut aussi dire que rien n’existe ' +
    'ailleurs. Effacer les données du site efface la liste. Sur iPhone, Safari ' +
    'la supprime après sept jours sans visite — ajouter cette page à l’écran ' +
    'd’accueil la conserve.',
  exportCount: n => `Exporter ${n} vin${s(n)}`,
  importFile: 'Importer un fichier',
  exported: n => `${n} vin${s(n)} exporté${s(n)}.`,
  imported: (total, added) =>
    `${total} importé${s(total)} — ${added} nouveau${s(added)}, ${total - added} déjà présent${s(total - added)}.`,
  importSkipped: n => ` ${n} entrée${s(n)} illisible${s(n)} ignorée${s(n)}.`,

  // --------------------------------------------------------------- find
  chooseBranch: 'Choisir une succursale',
  changeBranch: 'Changer',
  searchButton: 'Trouver des vins pour moi ici',
  emptyNoWinesTitle: 'D’abord, nommez un ou deux vins que vous avez aimés.',
  emptyNoWinesNote:
    'Les suggestions partent des vins que vous savez déjà apprécier : sans au ' +
    'moins un, il n’y a rien sur quoi s’appuyer.',
  emptyNoBranchTitle: 'Maintenant, choisissez votre succursale.',
  emptyNoBranchNote:
    'L’inventaire change d’une SAQ à l’autre : la liste ne vaut quelque chose ' +
    'qu’une fois qu’elle sait quelle tablette elle lit.',
  reqWines: group => `Des vins dans ${group}`,
  reqWinesMet: n => `${n} enregistrés. Largement de quoi classer une tablette.`,
  reqWinesOpen:
    'Aucun pour l’instant. Nommez-en un ou deux que vous avez aimés et le ' +
    'classement aura de quoi s’appuyer.',
  reqBranch: 'Une succursale',
  reqBranchMet: name => `${name}. Seules les bouteilles qu’elle a en tablette sont classées.`,
  reqBranchOpen: 'Pas encore choisie. Choisissez-en une et la recherche pourra se lancer.',
  bestMatches: 'Meilleures correspondances',
  rankedAgainst: n => `classés selon vos ${n} vins`,
  resultCount: (shown, total) => `${shown} affichés · ${total} correspondent à vos filtres`,
  lessLikeThis: 'Moins comme ça',
  hide: 'Masquer',
  noRating: 'Pas encore de note',
  ratingOf: score => `${score} / 100`,
  fromReviews: n => `d’après ${n} avis`,
  fromFewReviews: n => `d’après ${n} avis — trop peu pour s’y fier`,
  changeScope: 'Changer la portée',

  // ------------------------------------------------------------- search
  fetchingCatalog: 'Lecture du catalogue de cette succursale…',
  fetchingPage: (done, total) => `Lecture du catalogue… page ${done} sur ${total}`,
  searchFailed: reason => `Échec de la recherche : ${reason}`,
  couldNotSave: 'Impossible d’enregistrer dans ce navigateur.',

  // ---------------------------------------------------------- add wines
  addTitle: 'Ajouter des vins',
  addHeading: 'Nommez quelques vins que vous avez bus et sur lesquels vous avez un avis.',
  addSub:
    'Aimés ou détestés, les deux aident. Vous les trierez à l’étape suivante — ' +
    'pas ceux que vous pensez acheter.',
  onePerLine: 'Un par ligne',
  addPlaceholder: 'Château Bonnet\nRiesling Kabinett\nChianti Classico',
  lookUp: n => `Chercher ${n} vin${s(n)}`,
  lookingUp: 'Recherche…',
  reviewTitle: 'Vérifiez ces correspondances',
  back: 'Retour',
  save: n => `Enregistrer ${n} vin${s(n)}`,
  saving: 'Enregistrement…',
  noMatch: 'aucune correspondance — non ajouté',
  nothingChosen: 'rien de choisi — non ajouté',
  noneOfThese: 'Aucun de ceux-ci',
  whichWine: input => `De quel vin il s’agit pour ${input}`,
  whichList: name => `Dans quelle liste classer ${name}`,
  dismissUnmatched: input => `Écarter la ligne sans correspondance ${input}`,
  dismissMatched: name => `Ne pas ajouter ${name}`,
  fromInput: (price, input) => `${price} · d’après « ${input} »`,
  linesIgnored: n => `${n} ligne${s(n)} ignorée${s(n)} · `,
  batchSummary: (liked, steered) => `${liked} aimé${s(liked)}, ${steered} à éviter`,
  batchSkipped: n => `, ${n} à ne pas proposer`,
  catalogUnreachable: reason => `Impossible de joindre le catalogue de la SAQ : ${reason}`,
  stepName: '1 · Nommez-les',
  stepCheck: '2 · Vérifiez les correspondances',
  closeWithoutSaving: 'Fermer sans enregistrer',
  reviewHeading: 'Ce que le catalogue a trouvé',
  reviewTally: (matched, ambiguous, missing) =>
    [
      matched > 0 && `${matched} correspondance${matched > 1 ? 's' : ''} nette${matched > 1 ? 's' : ''}.`,
      ambiguous > 0 && `${ambiguous} à décider.`,
      missing > 0 && `${missing} sans résultat.`,
    ].filter(Boolean).join(' '),
  linesWillSave: (lines, saving) => `${lines} lignes · ${saving} seront enregistrés`,
  colYouTyped: 'Vous avez écrit',
  colMatch: 'Correspondance',
  colFileIn: 'Classer dans',
  otherMatches: n => `${n} autre${n > 1 ? 's' : ''} correspondance${n > 1 ? 's' : ''}`,
  needsDecision: 'À décider',
  manyMatch: n => `${n} vins correspondent à ce nom. Lequel avez-vous bu ?`,
  pickOrDrop: 'Choisissez-en un, ou retirez la ligne',
  showingOf: (shown, total) => `${shown} sur ${total} correspondances, les plus proches d’abord.`,
  noneDropLine: 'Aucun de ceux-ci — retirer la ligne',
  keepsTheRest: n => `Garde les ${n} autres`,
  foundNothing: n => `Sans résultat — ${n} ligne${n > 1 ? 's' : ''}`,
  notSavedNotThrown: 'Ni enregistré, ni jeté',
  editTheText: 'Modifier le texte',
  dropIt: 'Retirer',
  foundNothingWhy:
    'Les producteurs que la SAQ ne distribue pas, et les millésimes épuisés, ' +
    'ne seront pas trouvés. Votre liste n’a rien d’anormal.',
  backToText: 'Retour au texte',
  tally: (like, dislike, skip) => `${like} plus comme ça · ${dislike} moins · ${skip} masqués`,

  // ------------------------------------------------------------ branches
  branchTitle: 'Quelle succursale ?',
  branchFilter: n => `Filtrer ${n} succursales montréalaises`,
  branchFilterLabel: 'Filtrer les succursales',
  recent: 'Récentes',
  allBranches: 'Toutes les succursales · A–Z',
  noBranchMatch: 'Aucune succursale montréalaise ne correspond.',
  useBranch: name => `Utiliser ${name}`,
  useBranchEmpty: 'Utiliser cette succursale',
  montrealOnly: n => `Succursales de Montréal seulement — ${n} au total.`,
  inStockAt: n => ` · ${n} en tablette`,

  // ------------------------------------------------------------- filters
  filtersTitle: 'Filtres',
  reset: 'Réinitialiser',
  colour: 'Couleur',
  price: 'Prix',
  min: 'Min',
  max: 'Max',
  any: 'Tous',
  showCount: n => `Afficher ${n} vin${s(n)}`,
  showNone: 'Aucun vin dans cette fourchette',
  showWines: 'Afficher les vins',
  colourAll: 'Tous',
  colourRed: 'Rouge',
  colourWhite: 'Blanc',
  colourRose: 'Rosé',
  colourOrange: 'Orange',
  priceUnder: max => `Moins de ${money(max)}`,
  priceBetween: (min, max) => `${min}–${money(max)}`,
  priceOver: min => `${money(min)} et plus`,
  priceRange: (min, max) => `${min} – ${money(max)}`,
  priceFrom: min => `${money(min)} et plus`,
  priceUpTo: max => `Jusqu’à ${money(max)}`,
  anyPrice: 'Tous les prix',
  allColours: 'Toutes les couleurs',
  filterSummary: (colour, price, branch) => `${colour} · ${price} · en tablette à ${branch}`,
  thisBranch: 'cette succursale',
  narrowTheShelf: 'Restreindre la tablette',
  winesFit: n => `${n} vins correspondent à vos filtres`,
  thinBand: 'Fourchette étroite — élargissez-la un peu pour un meilleur classement.',
  searchTheseWines: n => `Chercher parmi ces ${n} vins`,
  resetFilters: 'Toutes les couleurs, tous les prix',
  branchSearchPlaceholder: 'Nom ou rue',
  lastTime: 'la dernière fois',
  whichShop: 'Dans quelle succursale êtes-vous ?',
  winesReadyNoBranch: n => `${n} vins prêts. Pas encore de succursale.`,

  // -------------------------------------------------------------- prompt
  promptTitle: 'Texte pour l’IA',
  secondOpinion: 'Obtenir un deuxième avis',
  promptExplain: branch =>
    `Ceci résume vos goûts et ce qu’il y a en tablette à ${branch}, en texte ` +
    `brut. Collez-le dans une IA et discutez avec elle.`,
  topN: n => `${n} premiers`,
  allN: n => `Tous les ${n}`,
  characters: n => `${n} caractères`,
  stepCopy: 'Étape 1 — copier',
  stepPaste: 'Étape 2 — coller dans une IA',
  copySummary: 'Copier le résumé',
  copiedChars: n => `Copié — ${n} caractères`,
  nowOpenChat: 'Ouvrez une IA et collez-le.',
  onClipboard: 'C’est dans votre presse-papiers. Demandez lequel vous plairait vraiment, et pourquoi.',
  copyAgain: 'Copier de nouveau',
  clipboardRefused:
    'Ce navigateur n’a pas permis à la page de copier. Le texte est ' +
    'sélectionnable — prenez-le à la main.',
  selectInstead: 'Sélectionner le texte',
  close: 'Fermer',
  promptMeta: (wines, chars) => `${wines} vins disponibles · ${chars} caractères`,
  copy: 'Copier',
  copied: 'Copié ✓',
  copyManually: 'Sélectionner et copier à la main',
  openChatGpt: 'Ouvrir ChatGPT ↗',
  include: 'Inclure',
  includeAll: 'Tous',
}
