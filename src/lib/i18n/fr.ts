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
  storageOk: 'gardé dans ce navigateur',
  storageBlocked: 'non gardé — ce navigateur bloque le stockage',
  language: 'Langue',

  // -------------------------------------------------------------- kinds
  kindLike: 'Aimés',
  kindDislike: 'À éviter',
  kindSkip: 'Ne pas proposer',

  // ----------------------------------------------------------- my wines
  likedEmpty: 'Ajoutez des vins que vous avez bus et aimés — pas ceux que vous pensez acheter.',
  dislikedEmpty: 'Des vins à éviter. Aussi utiles que ceux que vous aimez.',
  skippedNote:
    'Écartés de vos résultats et absents du texte pour l’IA. Contrairement ' +
    'à « À éviter », ceux-ci ne disent rien de vos goûts : aucun vin semblable ' +
    'n’est écarté à cause d’eux.',
  unresolvedSku: sku => `Code ${sku}`,
  unresolvedNote: 'introuvable au catalogue',
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
  favouritesHere: n =>
    n === 1 ? 'Un de vos vins est ici' : `${n} de vos vins sont ici`,
  bestMatches: 'Meilleures correspondances',
  resultCount: (shown, total) => `${shown} sur ${total}`,

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

  // -------------------------------------------------------------- prompt
  promptTitle: 'Texte pour l’IA',
  close: 'Fermer',
  promptMeta: (wines, chars) => `${wines} vins disponibles · ${chars} caractères`,
  copy: 'Copier',
  copied: 'Copié ✓',
  copyManually: 'Sélectionner et copier à la main',
  openChatGpt: 'Ouvrir ChatGPT ↗',
  include: 'Inclure',
  includeAll: 'Tous',
}
