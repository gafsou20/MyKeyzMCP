/** Fuseau horaire de l'agence. */
export const TZ = 'Asia/Jerusalem';

/** Epoch (secondes) → « YYYY-MM-DD HH:mm » heure d'Israël. */
export function epochToLocal(epoch: unknown): string | null {
  const n = typeof epoch === 'number' ? epoch : Number(epoch);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return parts.replace(',', '');
}

/** Décalage (minutes) d'Israël à une date donnée. */
function tzOffsetMinutes(date: Date): number {
  const local = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 60000);
}

/**
 * « YYYY-MM-DD » → epoch (secondes) du début (00:00) ou de la fin (23:59:59)
 * de cette journée en heure d'Israël. Utilisé pour les filtres min_/max_date_*.
 */
export function dayToEpoch(day: string, end = false): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Date invalide « ${day} » (format attendu YYYY-MM-DD).`);
  const base = new Date(`${day}T${end ? '23:59:59' : '00:00:00'}Z`);
  return Math.floor((base.getTime() - tzOffsetMinutes(base) * 60000) / 1000);
}

/**
 * « YYYY-MM-DD » → epoch (secondes) à 00:00 **UTC** : c'est le format du champ
 * calculé `data.time` de l'agenda côté API ($dateFromString sans fuseau).
 */
export function dayToUtcEpoch(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Date invalide « ${day} » (format attendu YYYY-MM-DD).`);
  return Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000);
}

/** Date du jour (YYYY-MM-DD) en heure d'Israël. */
export function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
}
