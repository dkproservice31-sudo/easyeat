// Utilitaires de parsing d'ingrédients (partagé entre IngredientsList,
// ShoppingScreen, etc.)

export function parseIngredients(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .map((s) => s.replace(/^[-•·*]\s*/, '').trim())
    .filter(Boolean);
}

const UNIT_RE =
  /^(g|gr|gramme[s]?|kg|kilo[s]?|mg|L|l|ml|cl|dl|oz|lb|cuillère[s]?|cuill\.?|c\.?\s*à\.?\s*[sc]\.?|cs|cc|tasse[s]?|verre[s]?|bol[s]?|pincée[s]?|gousse[s]?|branche[s]?|feuille[s]?|tranche[s]?|morceau[x]?|unité[s]?|pcs|paquet[s]?|boîte[s]?|sachet[s]?)\b\.?\s*/i;

// "200g de farine" → "farine", "1 gousse d'ail" → "ail",
// "2 cuillères à soupe d'huile" → "huile"
export function cleanIngredientName(raw) {
  let s = (raw || '').trim();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/^\d+[\d.,\/\s]*/, '');
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      .replace(UNIT_RE, '')
      .replace(/^(à\s+soupe\s+|à\s+café\s+|à\s+s\.?\s+|à\s+c\.?\s+)/i, '')
      .replace(
        /^(de\s+la\s+|de\s+l['']\s*|du\s+|des\s+|de\s+|d['']\s*)/i,
        ''
      );
    if (s === before) break;
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

// Retourne le fridge_item correspondant si présent (match bidirectionnel,
// insensible à la casse). fridgeItems: [{name, quantity, ...}]
export function findInFridge(name, fridgeItems) {
  const lc = (name || '').toLowerCase().trim();
  if (!lc) return null;
  for (const it of fridgeItems) {
    const n = (it.name || '').toLowerCase().trim();
    if (!n) continue;
    if (lc.includes(n) || n.includes(lc)) return it;
  }
  return null;
}
