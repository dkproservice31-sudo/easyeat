// Helpers pour filtrer les cuisines selon leur visibilité et leur planning.

// Retourne une date au format YYYY-MM-DD (local), utile pour comparer avec
// les colonnes `date` de Supabase qui arrivent aussi en YYYY-MM-DD.
export function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(baseIso, days) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth() + 1).padStart(2, '0');
  const d2 = String(dt.getDate()).padStart(2, '0');
  return `${y2}-${m2}-${d2}`;
}

export function isCuisineActive(cuisine, today = todayIso()) {
  if (!cuisine || cuisine.visible === false) return false;
  if (cuisine.schedule_start && cuisine.schedule_start > today) return false;
  if (cuisine.schedule_end && cuisine.schedule_end < today) return false;
  return true;
}

// Cuisines dont le schedule_start est dans les 7 prochains jours (exclus aujourd'hui).
export function isCuisineUpcoming(cuisine, today = todayIso()) {
  if (!cuisine || cuisine.visible === false) return false;
  if (!cuisine.schedule_start) return false;
  const plus7 = addDaysIso(today, 7);
  return cuisine.schedule_start > today && cuisine.schedule_start <= plus7;
}
