// Helpers pour les dates de péremption des items du frigo.
// Seuils proportionnels basés sur shelf_life_days si dispo, sinon fallback
// sur seuils fixes en jours.

export const EXPIRATION_STATUS = {
  NONE: 'none',
  FRESH: 'fresh',
  SOON: 'soon',
  URGENT: 'urgent',
  EXPIRED: 'expired',
};

export function getDaysRemaining(item) {
  if (!item || !item.expiration_date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(item.expiration_date);
  expDate.setHours(0, 0, 0, 0);

  return Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
}

export function getExpirationStatus(item) {
  if (!item || !item.expiration_date) return EXPIRATION_STATUS.NONE;

  const daysRemaining = getDaysRemaining(item);

  if (daysRemaining < 0) return EXPIRATION_STATUS.EXPIRED;

  const shelfLife = item.shelf_life_days;

  if (!shelfLife || shelfLife <= 0) {
    if (daysRemaining > 3) return EXPIRATION_STATUS.FRESH;
    if (daysRemaining >= 1) return EXPIRATION_STATUS.SOON;
    return EXPIRATION_STATUS.URGENT;
  }

  const ratio = daysRemaining / shelfLife;

  if (ratio > 0.4) return EXPIRATION_STATUS.FRESH;
  if (ratio > 0.15) return EXPIRATION_STATUS.SOON;
  return EXPIRATION_STATUS.URGENT;
}

export function getExpirationLabel(item) {
  const days = getDaysRemaining(item);
  if (days === null) return null;

  if (days < 0) {
    const abs = Math.abs(days);
    return `Périmé depuis ${abs} jour${abs > 1 ? 's' : ''}`;
  }
  if (days === 0) return "Périme aujourd'hui";
  if (days === 1) return 'Périme demain';
  return `Reste ${days} jours`;
}

export function computeExpirationDate(shelfLifeDays) {
  if (shelfLifeDays == null) return null;
  const n = Number(shelfLifeDays);
  if (!Number.isFinite(n) || n < 0) return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + Math.round(n));
  return date.toISOString().split('T')[0];
}

export function computeShelfLifeDays(expirationDateStr) {
  if (!expirationDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDateStr);
  exp.setHours(0, 0, 0, 0);
  const diff = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diff) || diff < 0) return null;
  return diff;
}

export function countExpiringItems(items) {
  let expired = 0;
  let urgent = 0;
  let soon = 0;

  if (!Array.isArray(items)) {
    return { expired: 0, urgent: 0, soon: 0, total_alert: 0 };
  }

  for (const item of items) {
    const days = getDaysRemaining(item);
    if (days === null) continue;

    if (days < 0) expired++;
    else if (days <= 1) urgent++;
    else if (days <= 5) soon++;
  }

  return {
    expired,
    urgent,
    soon,
    total_alert: expired + urgent + soon,
  };
}

export function getExpirationColor(status) {
  switch (status) {
    case EXPIRATION_STATUS.FRESH:
      return '#4ADE80';
    case EXPIRATION_STATUS.SOON:
      return '#FF9500';
    case EXPIRATION_STATUS.URGENT:
      return '#E74C3C';
    case EXPIRATION_STATUS.EXPIRED:
      return '#6B7280';
    case EXPIRATION_STATUS.NONE:
    default:
      return null;
  }
}
