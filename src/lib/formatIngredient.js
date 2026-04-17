// Met en forme un ingrédient structuré {name, quantity, unit} en phrase
// naturelle française : "500 g de pommes de terre", "2 citrons", "1 pincée de sel",
// "sel (au goût)", etc. Gère le pluriel des unités et l'élision "d'" devant voyelle.

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'h', 'à', 'â', 'é', 'è', 'ê', 'î', 'ï', 'ô', 'û', 'ù'];

function needsApostrophe(name) {
  if (!name) return false;
  const firstChar = name.trim().toLowerCase().charAt(0);
  return VOWELS.includes(firstChar);
}

function pluralizeUnit(unit, quantity) {
  if (!unit || quantity == null || quantity <= 1) return unit;
  const plurals = {
    'cuillère à soupe': 'cuillères à soupe',
    'cuillère à café': 'cuillères à café',
    'cuiller à soupe': 'cuillers à soupe',
    'cuiller à café': 'cuillers à café',
    'pincée': 'pincées',
    'branche': 'branches',
    'gousse': 'gousses',
    'tranche': 'tranches',
    'feuille': 'feuilles',
    'poignée': 'poignées',
    'filet': 'filets',
    'bouquet': 'bouquets',
    'verre': 'verres',
    'tasse': 'tasses',
  };
  return plurals[unit] || unit;
}

export function formatIngredient(item) {
  if (!item) return '';
  const { quantity, unit, name } = item;
  const lowerName = (name || '').toLowerCase().trim();
  if (!lowerName) return '';
  const link = needsApostrophe(lowerName) ? "d'" : 'de ';

  // Cas D : "selon le goût", "au besoin", "à volonté"…
  if (unit && /go[ûu]t|selon|besoin|volont[ée]/i.test(unit)) {
    return `${lowerName} (au goût)`;
  }

  // Cas E : quantité et unité absentes → juste le nom
  const qtyIsEmpty = quantity == null || quantity === 0;
  if (qtyIsEmpty && !unit) {
    return lowerName;
  }

  // Cas A : unité "unité" → masquer complètement
  if (unit && unit.toLowerCase() === 'unité') {
    return `${quantity} ${lowerName}`;
  }

  // Cas B / C : unité connue (g, kg, ml, L, cuillère, pincée, gousse…)
  const formattedUnit = pluralizeUnit(unit, quantity);
  if (!qtyIsEmpty) {
    if (formattedUnit) {
      return `${quantity} ${formattedUnit} ${link}${lowerName}`;
    }
    return `${quantity} ${lowerName}`;
  }

  // Fallback : unité sans quantité (rare)
  if (formattedUnit) {
    return `${formattedUnit} ${link}${lowerName}`;
  }
  return lowerName;
}
