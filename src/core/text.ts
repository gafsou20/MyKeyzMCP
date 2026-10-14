/** Normalise un texte pour la comparaison : minuscules, sans accents, sans ponctuation. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‎‏]/g, '')
    .toLowerCase()
    .replace(/[_\-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Humanise une clé snake_case (« nouveau_lead » → « Nouveau lead »). */
export function humanize(s: string): string {
  if (!s) return '';
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Échappe une chaîne pour un usage littéral dans une regex (l'API fait des $regex). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Convertit une valeur « nombre » stockée parfois en texte. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[\s,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
