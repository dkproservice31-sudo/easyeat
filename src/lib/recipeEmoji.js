// Retourne un emoji représentant une recette selon son titre.
// Les règles plus spécifiques passent AVANT les règles génériques.
export function getRecipeEmoji(title) {
  const t = (title || '').toLowerCase();

  // === Boissons / desserts très spécifiques ===
  if (/(caf[ée]|espresso|affogato)/.test(t)) return '☕';
  if (/(churros)/.test(t)) return '🍩';
  if (/(turrón|turron|nougat)/.test(t)) return '🍬';
  if (/(flan)/.test(t)) return '🍮';
  if (/(sangria)/.test(t)) return '🍷';

  // === Plats nommément spécifiques (priorité haute) ===
  if (/foie gras/.test(t)) return '🍽️';
  if (/(sole|vitello|tonnato|scaloppine|saltimbocca|osso\s*buco)/.test(t))
    return '🍽️';
  if (/(paella)/.test(t)) return '🥘';

  // === Cuisines du monde (arménienne, turque, moyen-orient…) ===
  if (/(dolma|tolma|sarma)/.test(t)) return '🍇';
  if (/(kebab|kebap|khorovats|brochette|chich|yakitori)/.test(t)) return '🍢';
  if (/(ghapama|citrouille|potiron|pumpkin)/.test(t)) return '🎃';
  if (/(baklava|paklava|gata|pakhlava)/.test(t)) return '🍰';
  if (/(manti|khinkali|pelmeni|shushbarak|byorek|b[oö]rek|bourek)/.test(t))
    return '🥟';
  if (/(lahmajoun|lahmacun)/.test(t)) return '🫓';
  if (/(jingyalov|jingalov)/.test(t)) return '🥬';
  if (/(lavash|pita|\bbread\b|naan)/.test(t)) return '🥖';
  if (/(pilaf|pilav|plov)/.test(t)) return '🍚';
  if (/(sini)/.test(t)) return '🍖';
  if (/(kofta|kofte)/.test(t)) return '🍖';
  if (/(harissa|khash|khashlama|rago[ûu]t|anushabur|fasulya|haricot)/.test(t))
    return '🍲';
  if (/(\bspas\b|soup\b)/.test(t)) return '🍲';
  if (/\bsalad\b/.test(t)) return '🥗';

  if (/(caprese|insalata)/.test(t)) return '🥗';
  if (/(gazpacho|salmorejo|ensaladilla|salade|ni[çc]oise)/.test(t)) return '🥗';
  if (/(tortilla espa|tortilla)/.test(t)) return '🍳';
  if (/(quiche)/.test(t)) return '🥧';
  if (/(gambas|crevette|calamar|calmar|fruits de mer|pulpo)/.test(t))
    return '🦐';
  if (/(croqueta|croquette)/.test(t)) return '🍘';
  if (/(arancini|beignet)/.test(t)) return '🍘';
  if (/(albondigas|polpette|boulette)/.test(t)) return '🍖';
  if (/(chorizo|jam[oó]n|jambon|charcuterie|saindoux|lard)/.test(t)) return '🥓';

  // === Viandes ===
  if (/(canard|magret)/.test(t)) return '🦆';
  if (/(agneau|navarin|gigot)/.test(t)) return '🍖';
  if (/(bistecca|steak|entrec[ôo]te|c[ôo]te\b|cordero|cochinillo|porchetta)/.test(t))
    return '🥩';
  if (/\b(b(oe|œ)uf|veau|bourguignon|blanquette|tartare)\b/.test(t))
    return '🥩';
  if (/\b(poulet|coq)\b/.test(t)) return '🍗';

  // === Fruits de mer / coquillages (priorité avant "poissons") ===
  if (/\b(moules?|coquilles?|saint[\s-]?jacques|hu[îi]tres?)\b/.test(t))
    return '🦪';
  if (/\bhomards?\b/.test(t)) return '🦞';
  if (/\bcrabes?\b/.test(t)) return '🦀';

  // === Poissons ===
  if (/(bacalao|baccal[àa]|morue|poisson|saumon|thon|anchois|brandade|bouillabaisse|merlu|branzino|cabillaud|dorade|bar\b)/.test(t))
    return '🐟';

  // === Riz / féculents ===
  if (/(risotto|arroz|\briz\b)/.test(t)) return '🍚';
  if (/(p[âa]tes|spaghetti|carbonara|lasagn|tagliatelle|fettuccine|penne|fideuà|gnocchi|ravioli|raviole|cannelloni)/.test(t))
    return '🍝';

  // === Pommes de terre ===
  if (/(patatas|pomme de terre|dauphinois|vichyssoise|brava)/.test(t))
    return '🥔';

  // === Œufs ===
  if (/([oœ]uf|omelette|frittata)/.test(t)) return '🍳';

  // === Desserts génériques ===
  if (/(g[âa]teau|tarte|cr[èe]me|mousse|tiramis[uù]|panna cotta|profiterole|clafoutis|far breton|kouign|madeleine|financier|cannoli|zabaione|torta caprese|crema catalana|cr[êe]me br[ûu]l[ée]e|[îi]le flottante|arroz con leche|pain perdu)/.test(t))
    return '🍰';
  if (/(cr[êe]pe|galette|pissaladi[èe]re)/.test(t)) return '🥞';

  // === Fromage / gratins ===
  if (/(fromage|fondue|tartiflette|parmigiana)/.test(t)) return '🧀';

  // === Pain / pizza ===
  if (/(pizza|calzone)/.test(t)) return '🍕';
  if (/(pain|pan con tomate|bruschetta|focaccia|migas)/.test(t)) return '🥖';

  // === Soupes et mijotés ===
  if (/(soupe|bouillon|pot-au-feu|potaje|minestrone|velout[ée]|bisque|ribollita|porrusalda|marmitako|zuppa|cocido|fabada|lentejas)/.test(t))
    return '🍲';
  if (/(cassoulet|ratatouille|gratin|caponata|pisto|piment|confit|daube|terrine)/.test(t))
    return '🍲';

  return '🍴';
}
