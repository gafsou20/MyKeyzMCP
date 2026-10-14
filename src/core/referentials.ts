import * as paramsApi from '../api/params.js';
import type { MenuItem, ParamItem } from '../types/models.js';
import { currentToken } from './context.js';
import { glossaryEntry } from '../domain/glossary.js';
import { humanize, norm } from './text.js';
import { ToolError } from './errors.js';

/**
 * Référentiels MyKeyz (`GET /param/all`).
 *
 * Le back ne stocke que des **ids** et ne fait aucune jointure : c'est ici que
 * l'on traduit id ↔ libellé, dans les deux sens, pour que l'agent manipule des
 * libellés métier (« NRP », « Ramat Gan ») au lieu d'ids opaques.
 */

export type RefId = number | string;
export interface RefPair {
  id: RefId;
  label: string;
}

interface RefStore {
  menu: MenuItem[];
  params: Record<string, ParamItem[]>;
  loadedAt: number;
}

/** Durée de vie du cache (un référentiel modifié dans le CRM est vu sous 10 min). */
const TTL_MS = 10 * 60 * 1000;
/** Nombre max de sessions en cache (évite une croissance infinie en HTTP). */
const MAX_ENTRIES = 200;

const cache = new Map<string, RefStore>();

function cacheKey(): string {
  return currentToken() ?? '__anon__';
}

/** Charge les référentiels du token courant (cache 10 min par token). */
export async function ensureLoaded(force = false): Promise<void> {
  const key = cacheKey();
  const hit = cache.get(key);
  if (hit && !force && Date.now() - hit.loadedAt < TTL_MS) return;
  const res = await paramsApi.all();
  setStore(res.params ?? {}, res.menu ?? []);
}

/** Injecte des référentiels (utilisé par ensureLoaded et par les tests). */
export function setStore(params: Record<string, ParamItem[]>, menu: MenuItem[] = []): void {
  const key = cacheKey();
  cache.delete(key);
  cache.set(key, { menu, params, loadedAt: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function store(): RefStore | undefined {
  return cache.get(cacheKey());
}

export function list(model: string): ParamItem[] {
  const items = store()?.params[model];
  return Array.isArray(items) ? items : [];
}

export function modelNames(): string[] {
  return Object.keys(store()?.params ?? {})
    .filter((k) => k !== 'Model')
    .sort();
}

export function menuItems(): MenuItem[] {
  return store()?.menu ?? [];
}

/** Ids comparés en souplesse (l'API mélange parfois 3 et "3"). */
function sameId(a: unknown, b: unknown): boolean {
  return a === b || (a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b));
}

export function item(model: string, id: unknown): ParamItem | undefined {
  if (id === null || id === undefined || id === '') return undefined;
  return list(model).find((x) => sameId(x.id, id));
}

/** Libellé FR d'un élément de référentiel. */
function itemLabel(model: string, x: ParamItem): string {
  const g = glossaryEntry(model, x.titre);
  if (g) return g.label;
  if (x.titre_fr) return String(x.titre_fr);
  const site = x.site as { fr?: string } | undefined;
  if (site?.fr) return site.fr;
  if (model === 'User' && (x.prenom || x.nom)) return `${x.prenom ?? ''} ${x.nom ?? ''}`.trim();
  return humanize(String(x.titre ?? ''));
}

/** Libellé d'un id (ou null si inconnu). */
export function label(model: string, id: unknown): string | null {
  const x = item(model, id);
  return x ? itemLabel(model, x) : null;
}

/**
 * Couple `{ id, label }` pour les sorties d'outils : l'agent garde l'id
 * (réutilisable en écriture) ET le libellé (compréhension). null si pas d'id.
 */
export function pair(model: string, id: unknown): RefPair | null {
  if (id === null || id === undefined || id === '' || id === false) return null;
  const x = item(model, id);
  if (!x) return { id: id as RefId, label: `inconnu (#${String(id)})` };
  return { id: x.id as RefId, label: itemLabel(model, x) };
}

export function pairs(model: string, ids: unknown): RefPair[] {
  const arr = Array.isArray(ids) ? ids : ids === null || ids === undefined ? [] : [ids];
  return arr.map((i) => pair(model, i)).filter((p): p is RefPair => p !== null);
}

/** Champ parent pour les référentiels dépendants. */
export const PARENT_FIELD: Record<string, string> = {
  ContactCategorieOption: 'categorie_id',
  ProprieteBienOption: 'bien_id',
};

/** Toutes les formes textuelles sous lesquelles un élément peut être désigné. */
function names(model: string, x: ParamItem): string[] {
  const out = [String(x.id), String(x.titre ?? ''), itemLabel(model, x)];
  for (const k of ['titre_fr', 'titre_he', 'titre_en', 'prenom', 'nom', 'code']) if (x[k]) out.push(String(x[k]));
  const site = x.site as Record<string, string> | undefined;
  if (site && typeof site === 'object') out.push(...Object.values(site).filter(Boolean).map(String));
  if (model === 'User' && x.prenom && x.nom) out.push(`${x.prenom} ${x.nom}`, `${x.nom} ${x.prenom}`);
  const g = glossaryEntry(model, x.titre);
  if (g?.aliases) out.push(...g.aliases);
  return [...new Set(out.map(norm).filter(Boolean))];
}

function optionsHint(model: string, candidates: ParamItem[]): string {
  const shown = candidates.slice(0, 40).map((x) => `${String(x.id)}=${itemLabel(model, x)}`);
  return shown.join(' · ') + (candidates.length > 40 ? ` … (+${candidates.length - 40})` : '');
}

/**
 * Résout une valeur fournie par l'agent (id numérique, id en texte, clé
 * technique, libellé FR/HE/EN, alias, nom d'agent…) en id de référentiel.
 * `parent` restreint les référentiels dépendants (ex. options d'une catégorie).
 * Lève une ToolError listant les valeurs possibles si rien ne correspond.
 */
export function resolve(model: string, value: unknown, parent?: unknown): RefId {
  let candidates = list(model);
  if (!candidates.length) throw new ToolError(`Référentiel ${model} indisponible pour cet utilisateur.`);
  const pf = PARENT_FIELD[model];
  if (pf && parent !== undefined && parent !== null) {
    candidates = candidates.filter((x) => sameId(x[pf], parent));
  }
  const scope = pf && parent != null ? ` (pour ${pf}=${String(parent)})` : '';
  if (typeof value === 'number') {
    const x = candidates.find((c) => sameId(c.id, value));
    if (x) return x.id as RefId;
    throw new ToolError(`${model} : id ${value} inconnu${scope}. Valeurs possibles : ${optionsHint(model, candidates)}`);
  }
  const q = norm(value);
  if (!q) throw new ToolError(`${model} : valeur vide.`);
  const exact = candidates.filter((x) => names(model, x).includes(q));
  if (exact.length === 1) return exact[0].id as RefId;
  // Égalité sur l'id texte prioritaire (ex. "3"), sinon correspondance partielle.
  const byId = exact.find((x) => String(x.id) === String(value).trim());
  if (byId) return byId.id as RefId;
  const pool = exact.length ? exact : candidates;
  const partial = pool.filter((x) =>
    names(model, x).some((n) => n.startsWith(q) || n.includes(q) || (q.length >= 4 && n.length >= 4 && q.includes(n))),
  );
  if (partial.length === 1) return partial[0].id as RefId;
  if (partial.length > 1) {
    throw new ToolError(`${model} : « ${String(value)} » est ambigu${scope}. Précise parmi : ${optionsHint(model, partial)}`);
  }
  throw new ToolError(`${model} : « ${String(value)} » introuvable${scope}. Valeurs possibles : ${optionsHint(model, candidates)}`);
}

export function resolveMany(model: string, values: unknown, parent?: unknown): RefId[] {
  if (values === undefined || values === null) return [];
  const arr = Array.isArray(values) ? values : [values];
  return [...new Set(arr.map((v) => resolve(model, v, parent)))];
}

/** Résout si fourni (undefined = non fourni, null = effacer). */
export function resolveOpt(model: string, value: unknown, parent?: unknown): RefId | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return resolve(model, value, parent);
}

/** Entrées complètes d'un référentiel pour `list_referentials`. */
export function entries(model: string) {
  const pf = PARENT_FIELD[model];
  return list(model).map((x) => {
    const g = glossaryEntry(model, x.titre);
    return {
      id: x.id as RefId,
      label: itemLabel(model, x),
      key: String(x.titre ?? ''),
      ...(g?.meaning ? { meaning: g.meaning } : {}),
      ...(pf && x[pf] !== undefined ? { parent_id: x[pf] as RefId } : {}),
    };
  });
}
