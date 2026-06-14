import * as paramsApi from '../api/params.js';
import type { MenuItem, ParamItem } from '../types/models.js';
import { DEFAULT_LOCALE } from './config.js';

type Locale = 'fr' | 'he' | 'en';

/** Humanise une clé snake_case (« nouveau_lead » → « Nouveau lead »). */
function humanize(s: string): string {
  if (!s) return '';
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Cache du dictionnaire de jointures `/param/all`.
 * L'API ne fait pas les jointures id→libellé : c'est résolu ici, comme dans le CRM.
 */
let menu: MenuItem[] = [];
let params: Record<string, ParamItem[]> = {};
let loadedAt: number | null = null;

export async function load(force = false): Promise<void> {
  if (loadedAt && !force) return;
  const res = await paramsApi.all();
  menu = res.menu ?? [];
  params = res.params ?? {};
  loadedAt = Date.now();
}

/** Liste d'un référentiel. */
export function list(model: string): ParamItem[] {
  return params[model] ?? [];
}

/** Résout un id → objet du référentiel. */
export function option(model: string, id: number | null | undefined): ParamItem | undefined {
  if (id === null || id === undefined) return undefined;
  return list(model).find((x) => x.id === id);
}

/** Résout un id → libellé traduit. Langue par défaut = fr. */
export function label(model: string, id: number | null | undefined, lang: Locale = DEFAULT_LOCALE): string {
  const item = option(model, id);
  if (!item) return '';
  const translated = item[`titre_${lang}`];
  if (translated) return String(translated);
  return humanize(item.titre ?? '');
}

export function menuItems(): MenuItem[] {
  return menu;
}
