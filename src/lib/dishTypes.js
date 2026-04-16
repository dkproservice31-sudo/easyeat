// Types de plat utilisés pour le filtre / la classification IA.
// La valeur 'tout' n'est pas un type réel — c'est le filtre par défaut qui
// désactive le filtrage côté UI.

export const DISH_TYPES = [
  { key: 'viande', label: 'Viande', emoji: '🥩' },
  { key: 'poisson', label: 'Poisson', emoji: '🐟' },
  { key: 'vegan', label: 'Vegan', emoji: '🌱' },
  { key: 'végétarien', label: 'Végétarien', emoji: '🥚' },
  { key: 'dessert', label: 'Dessert', emoji: '🍰' },
];

export const DISH_FILTER_ALL = 'tout';

// Normalise pour comparaison (insensible à la casse + accents)
export function normalizeDishType(s) {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function matchesDishType(recipeDishType, filterKey) {
  if (!filterKey || filterKey === DISH_FILTER_ALL) return true;
  const dt = normalizeDishType(recipeDishType);
  // Tant qu'une recette n'est pas classée (dish_type = 'tout' ou vide),
  // elle apparaît dans tous les filtres pour ne pas la cacher à l'utilisateur.
  if (!dt || dt === DISH_FILTER_ALL) return true;
  return dt === normalizeDishType(filterKey);
}
