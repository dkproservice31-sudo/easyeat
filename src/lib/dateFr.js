// Format date en français complet : "Mardi 15 février 2025"
export function formatDateFr(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
  // Capitalise la première lettre
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Format heure en français : "14h30"
export function formatTimeFr(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}h${m}`;
}

// Format complet : "Mardi 15 février 2025 à 14h30"
export function formatDateTimeFr(date) {
  return `${formatDateFr(date)} à ${formatTimeFr(date)}`;
}
