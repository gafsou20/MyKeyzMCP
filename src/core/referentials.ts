import * as paramsApi from '../api/params.js';
import type { MenuItem, ParamItem } from '../types/models.js';
import { DEFAULT_LOCALE } from './config.js';
import { currentToken } from './context.js';

type Locale = 'fr' | 'he' | 'en';

interface RefStore {
  menu: MenuItem[];
  params: Record<string, ParamItem[]>;
}

/** Humanise une clé snake_case (« nouveau_lead » → « Nouveau lead »). */
function humanize(s: string): string {
  if (!s) return '';
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Cache du dictionnaire de jointures `/param/all`, **par token** : en HTTP
 * multi-utilisateur, chaque utilisateur/env peut avoir des référentiels et un
 * menu (ACL) différents. En stdio, il n'y a qu'une seule entrée.
 */
const cache = new Map<string, RefStore>();

function cacheKey(): string {
  return currentToken() ?? '__anon__';
}

/** Charge les référentiels du token courant s'ils ne sont pas déjà en cache. */
export async function ensureLoaded(force = false): Promise<void> {
  const key = cacheKey();
  if (cache.has(key) && !force) return;
  const res = await paramsApi.all();
  cache.set(key, { menu: res.menu ?? [], params: res.params ?? {} });
}

function store(): RefStore | undefined {
  return cache.get(cacheKey());
}

/** Liste d'un référentiel. */
export function list(model: string): ParamItem[] {
  return store()?.params[model] ?? [];
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
  return store()?.menu ?? [];
}

/** Noms de tous les référentiels disponibles (ex. ContactStatus, ProprieteBien…). */
export function modelNames(): string[] {
  return Object.keys(store()?.params ?? {}).sort();
}

/** Couples id ↔ libellé d'un référentiel (clé snake_case d'origine incluse). */
export function entries(model: string, lang?: Locale): { id: number; label: string; key: string }[] {
  return list(model).map((x) => ({
    id: x.id,
    label: label(model, x.id, lang),
    key: x.titre ?? '',
  }));
}
