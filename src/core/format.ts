import type { Adresse, I18nField } from '../types/api.js';
import { DEFAULT_LOCALE } from './config.js';

type Locale = 'fr' | 'he' | 'en';

/** Extrait la meilleure traduction d'un champ multilingue (langue puis repli fr). */
export function i18nText(field?: I18nField | null, lang: Locale = DEFAULT_LOCALE): string | null {
  if (!field) return null;
  return field[lang] || field.fr || field.he || field.en || null;
}

/** Adresse postale en une ligne lisible. */
export function addressLine(adresse?: Adresse | null): string | null {
  if (!adresse) return null;
  const parts = [adresse.street_number, adresse.route, adresse.locality, adresse.quartier]
    .filter(Boolean)
    .join(' ')
    .trim();
  return parts || null;
}
