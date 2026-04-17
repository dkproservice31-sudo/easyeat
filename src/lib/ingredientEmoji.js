// Mapping ingrédient → emoji pour les ingrédients du frigo.
// Matching par mots-clés, insensible à la casse et aux accents.

const EMOJI_MAP = [
  // Légumes
  { keywords: ['tomate', 'tomates'], emoji: '🍅' },
  { keywords: ['oignon', 'oignons', 'echalote', 'échalote'], emoji: '🧅' },
  { keywords: ['ail', 'gousse'], emoji: '🧄' },
  { keywords: ['carotte', 'carottes'], emoji: '🥕' },
  { keywords: ['poivron', 'piment'], emoji: '🫑' },
  { keywords: ['concombre', 'cornichon'], emoji: '🥒' },
  { keywords: ['salade', 'laitue', 'roquette', 'mache', 'mâche', 'epinard', 'épinard'], emoji: '🥬' },
  { keywords: ['champignon', 'champignons', 'cèpe', 'cepe', 'girolle'], emoji: '🍄' },
  { keywords: ['brocoli', 'broccoli'], emoji: '🥦' },
  { keywords: ['mais', 'maïs'], emoji: '🌽' },
  { keywords: ['patate', 'pomme de terre', 'pommes de terre'], emoji: '🥔' },
  { keywords: ['aubergine'], emoji: '🍆' },
  { keywords: ['courgette'], emoji: '🥒' },
  { keywords: ['avocat'], emoji: '🥑' },
  { keywords: ['haricot', 'haricots', 'flageolet'], emoji: '🫘' },
  { keywords: ['petits pois', 'pois'], emoji: '🟢' },

  // Fruits
  { keywords: ['pomme', 'pommes'], emoji: '🍎' },
  { keywords: ['poire', 'poires'], emoji: '🍐' },
  { keywords: ['banane', 'bananes'], emoji: '🍌' },
  { keywords: ['orange', 'oranges', 'clementine', 'clémentine', 'mandarine'], emoji: '🍊' },
  { keywords: ['citron', 'lime'], emoji: '🍋' },
  { keywords: ['fraise', 'fraises'], emoji: '🍓' },
  { keywords: ['framboise', 'mure', 'mûre', 'myrtille'], emoji: '🫐' },
  { keywords: ['raisin', 'raisins'], emoji: '🍇' },
  { keywords: ['peche', 'pêche', 'nectarine', 'abricot'], emoji: '🍑' },
  { keywords: ['ananas'], emoji: '🍍' },
  { keywords: ['mangue'], emoji: '🥭' },
  { keywords: ['melon', 'pasteque', 'pastèque'], emoji: '🍉' },
  { keywords: ['kiwi'], emoji: '🥝' },
  { keywords: ['noix de coco', 'coco'], emoji: '🥥' },
  { keywords: ['cerise', 'cerises'], emoji: '🍒' },

  // Viandes et poissons
  { keywords: ['boeuf', 'bœuf', 'steak', 'bavette', 'faux-filet'], emoji: '🥩' },
  { keywords: ['poulet', 'volaille', 'dinde'], emoji: '🍗' },
  { keywords: ['porc', 'jambon', 'lard', 'bacon', 'saucisse', 'chorizo'], emoji: '🥓' },
  { keywords: ['agneau', 'mouton'], emoji: '🐑' },
  { keywords: ['poisson', 'saumon', 'thon', 'cabillaud', 'dorade', 'bar', 'lieu', 'sardine'], emoji: '🐟' },
  { keywords: ['crevette', 'gambas', 'langoustine'], emoji: '🍤' },
  { keywords: ['moule', 'moules', 'coquille'], emoji: '🦪' },
  { keywords: ['homard', 'langouste'], emoji: '🦞' },
  { keywords: ['crabe', 'tourteau'], emoji: '🦀' },
  { keywords: ['calamar', 'encornet', 'poulpe', 'seiche'], emoji: '🦑' },

  // Produits laitiers et œufs
  { keywords: ['œuf', 'oeuf', 'œufs', 'oeufs'], emoji: '🥚' },
  { keywords: ['lait'], emoji: '🥛' },
  { keywords: ['fromage', 'gruyere', 'gruyère', 'comté', 'comte', 'emmental', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'chèvre', 'chevre', 'camembert', 'brie', 'reblochon'], emoji: '🧀' },
  { keywords: ['yaourt', 'fromage blanc', 'skyr'], emoji: '🥣' },
  { keywords: ['beurre'], emoji: '🧈' },
  { keywords: ['creme', 'crème'], emoji: '🥛' },

  // Céréales et féculents
  { keywords: ['pain', 'baguette', 'brioche'], emoji: '🍞' },
  { keywords: ['pates', 'pâtes', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'lasagne', 'ravioli'], emoji: '🍝' },
  { keywords: ['riz'], emoji: '🍚' },
  { keywords: ['quinoa', 'boulgour', 'semoule', 'couscous'], emoji: '🌾' },
  { keywords: ['farine'], emoji: '🌾' },
  { keywords: ['avoine', 'flocons'], emoji: '🌾' },

  // Condiments et épices
  { keywords: ['sel'], emoji: '🧂' },
  { keywords: ['poivre'], emoji: '🌶️' },
  { keywords: ['huile'], emoji: '🫒' },
  { keywords: ['vinaigre'], emoji: '🍶' },
  { keywords: ['moutarde'], emoji: '🟡' },
  { keywords: ['ketchup', 'mayonnaise', 'sauce'], emoji: '🍅' },
  { keywords: ['miel'], emoji: '🍯' },
  { keywords: ['sucre', 'cassonade'], emoji: '🍬' },

  // Herbes aromatiques
  { keywords: ['basilic', 'persil', 'coriandre', 'ciboulette', 'menthe', 'thym', 'romarin', 'laurier', 'aneth', 'estragon', 'herbe'], emoji: '🌿' },

  // Légumineuses et oléagineux
  { keywords: ['lentille', 'lentilles', 'pois chiche', 'pois chiches'], emoji: '🫘' },
  { keywords: ['amande', 'noix', 'noisette', 'pistache', 'cacahuete', 'cacahuète'], emoji: '🥜' },

  // Boissons
  { keywords: ['eau'], emoji: '💧' },
  { keywords: ['jus'], emoji: '🧃' },
  { keywords: ['cafe', 'café'], emoji: '☕' },
  { keywords: ['the', 'thé', 'tisane'], emoji: '🍵' },
  { keywords: ['biere', 'bière'], emoji: '🍺' },
  { keywords: ['vin'], emoji: '🍷' },

  // Chocolat et sucré
  { keywords: ['chocolat'], emoji: '🍫' },
  { keywords: ['gateau', 'gâteau', 'biscuit', 'cookie'], emoji: '🍪' },
  { keywords: ['glace', 'sorbet'], emoji: '🍨' },
];

// Retire les accents d'une chaîne
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function getIngredientEmoji(name) {
  if (!name || typeof name !== 'string') return '🍴';
  const normalized = stripAccents(name.toLowerCase().trim());

  for (const entry of EMOJI_MAP) {
    for (const keyword of entry.keywords) {
      const normalizedKeyword = stripAccents(keyword.toLowerCase());
      if (normalized.includes(normalizedKeyword)) {
        return entry.emoji;
      }
    }
  }
  return '🍴'; // emoji par défaut
}
