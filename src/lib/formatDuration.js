// Formate une durée en minutes en chaîne lisible.
//   35    → "35 min"
//   120   → "2h"
//   150   → "2h 30min"
//   1440  → "1 jour"
//   51840 → "36 jours"
//   86400 → "2 mois"
export function formatDuration(minutes) {
  const m = Number(minutes);
  if (!m || isNaN(m) || m <= 0) return '';

  if (m < 60) return `${Math.round(m)} min`;

  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = Math.round(m - h * 60);
    return r === 0 ? `${h}h` : `${h}h ${r}min`;
  }

  if (m < 43200) {
    const days = Math.round(m / 1440);
    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  const months = Math.round(m / 43200);
  return `${months} mois`;
}
