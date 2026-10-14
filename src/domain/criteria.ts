import * as ref from '../core/referentials.js';
import { toNum } from '../core/text.js';
import type { CriteriaInput } from '../tools/schemas.js';

/**
 * Traduction des critères « métier » (outil MCP) ↔ format exact de l'API.
 *
 * Le format API est celui de `ContactSearch::$data` (back) = formulaire
 * `Recherche.vue` (front) = filtres de `POST /propriete/listev2`. Toute autre
 * clé est ignorée silencieusement par l'API → la recherche ne matche jamais
 * (cas réel : recherche #1533). D'où ce mapping strict.
 */

const NUMERIC: [keyof CriteriaInput, string][] = [
  ['pieces_min', 'min_nb_pieces'],
  ['pieces_max', 'max_nb_pieces'],
  ['surface_min', 'min_superficie'],
  ['surface_max', 'max_superficie'],
  ['etage_min', 'min_etage'],
  ['etage_max', 'max_etage'],
  ['prix_min', 'min_prix_vente'],
  ['prix_max', 'max_prix_vente'],
];

const BOOLEAN: [keyof CriteriaInput, string][] = [
  ['terrasse', 'terrace'],
  ['parking', 'parking'],
  ['jardin', 'jardin'],
  ['toit', 'toit'],
  ['ascenseur', 'ascenseur'],
  ['meuble', 'meuble'],
  ['cave', 'cave'],
];

/** Squelette API complet (valeurs « indifférent »), identique au défaut back. */
export function emptyApiData(): Record<string, unknown> {
  return {
    'adresse.locality': [],
    'adresse.quartier_id': [],
    transaction_id: [],
    bien_id: [],
    bien_option_id: [],
    min_nb_pieces: null,
    max_nb_pieces: null,
    min_superficie: null,
    max_superficie: null,
    min_etage: null,
    max_etage: null,
    min_prix_vente: null,
    max_prix_vente: null,
    terrace: null,
    parking: null,
    jardin: null,
    toit: null,
    ascenseur: null,
    meuble: null,
    cave: null,
  };
}

/** Résout des options de bien en tenant compte du/des type(s) de bien choisis. */
function resolveOptions(values: unknown, bienIds: ref.RefId[]): ref.RefId[] {
  if (values === undefined || values === null) return [];
  const arr = Array.isArray(values) ? values : [values];
  return [
    ...new Set(arr.map((v) => ref.resolve('ProprieteBienOption', v, bienIds.length === 1 ? bienIds[0] : undefined))),
  ];
}

/**
 * Critères métier → `data` API. `base` permet une mise à jour partielle :
 * seules les clés fournies sont modifiées (undefined = inchangé).
 */
export function toApiData(c: CriteriaInput, base: Record<string, unknown> = emptyApiData()): Record<string, unknown> {
  // On repart du squelette propre : les clés hors format (ex. #1533) sont purgées.
  const data: Record<string, unknown> = { ...emptyApiData() };
  for (const k of Object.keys(data)) if (base[k] !== undefined) data[k] = base[k];

  if (c.villes !== undefined) data['adresse.locality'] = ref.resolveMany('Ville', c.villes);
  if (c.quartiers !== undefined) data['adresse.quartier_id'] = ref.resolveMany('Quartier', c.quartiers);
  if (c.transaction !== undefined) data.transaction_id = ref.resolveMany('ProprieteTransaction', c.transaction);
  if (c.types_bien !== undefined) data.bien_id = ref.resolveMany('ProprieteBien', c.types_bien);
  if (c.options_bien !== undefined) {
    data.bien_option_id = resolveOptions(c.options_bien, (data.bien_id as ref.RefId[]) ?? []);
  }
  for (const [k, api] of NUMERIC) if (c[k] !== undefined) data[api] = c[k] === null ? null : toNum(c[k]);
  for (const [k, api] of BOOLEAN) if (c[k] !== undefined) data[api] = c[k];
  return data;
}

/** `data` API → critères lisibles (ids + libellés). */
export function fromApiData(data: Record<string, unknown> | null | undefined) {
  const d = data ?? {};
  const out: Record<string, unknown> = {
    villes: ref.pairs('Ville', d['adresse.locality']).map((p) => p.label),
    quartiers: ref.pairs('Quartier', d['adresse.quartier_id']),
    transaction: ref.pairs('ProprieteTransaction', d.transaction_id),
    types_bien: ref.pairs('ProprieteBien', d.bien_id),
    options_bien: ref.pairs('ProprieteBienOption', d.bien_option_id),
  };
  for (const [k, api] of NUMERIC) out[k] = toNum(d[api]);
  for (const [k, api] of BOOLEAN) out[k] = d[api] ?? null;
  const known = new Set(Object.keys(emptyApiData()));
  const unknown = Object.keys(d).filter((k) => !known.has(k));
  if (unknown.length) {
    out.anomalie = `Clés hors format ignorées par l'API (${unknown.join(', ')}) : cette recherche ne matche pas correctement. Corrige-la via update_search.`;
  }
  return out;
}
