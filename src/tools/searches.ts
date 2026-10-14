import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import * as proprietesApi from '../api/proprietes.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { toApiData } from '../domain/criteria.js';
import { ToolError } from '../core/errors.js';
import * as mcpApi from '../api/mcp.js';
import type { SearchWithContact } from '../api/mcp.js';
import { dayToEpoch, epochToLocal } from '../core/dates.js';
import { norm } from '../core/text.js';
import { handler, page } from './run.js';
import { criteriaShape, criteriaSchema, day, ref as refIn, refs, type CriteriaInput } from './schemas.js';
import type { ContactSearch, Propriete } from '../types/models.js';

const CRITERIA_KEYS = Object.keys(criteriaShape) as (keyof CriteriaInput)[];

function pickCriteria(a: Record<string, unknown>): CriteriaInput {
  const c: Record<string, unknown> = {};
  for (const k of CRITERIA_KEYS) if (a[k] !== undefined) c[k] = a[k];
  return criteriaSchema.parse(c);
}

async function findSearch(contact_id: number, id: number): Promise<ContactSearch> {
  const d = await contactsApi.get(contact_id);
  const s = (d.searchs ?? []).find((x) => x.id === id);
  if (!s) throw new ToolError(`Recherche #${id} introuvable sur le contact #${contact_id} (voir get_contact).`);
  return s;
}

/** Filtres de biens communs : uniquement les mandats propres + disponibles par défaut. */
export function proprieteFilters(
  data: Record<string, unknown>,
  opts: { inclure_annonces?: boolean; disponibles_seulement?: boolean },
): Record<string, unknown> {
  const f: Record<string, unknown> = { ...data };
  if (!opts.inclure_annonces) f.origine_id = [0];
  if (opts.disponibles_seulement !== false) f.status_id = [ref.resolve('ProprieteStatus', 'disponible')];
  return f;
}

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    'create_search',
    {
      title: 'Créer une recherche acheteur',
      description:
        "Enregistre les critères de recherche d'un contact (acheteur/locataire). Les critères sont STRICTS et traduits au format exact de l'API : le matching contact ⇄ biens fonctionne alors dans les deux sens. Critère omis = indifférent. Les référentiels acceptent ids ou libellés.",
      inputSchema: {
        contact_id: z.number().int(),
        statut: refIn('ContactSearchStatus', 'Défaut « En cours ».').optional(),
        ...criteriaShape,
      },
    },
    handler(async (a) => {
      const data = toApiData(pickCriteria(a));
      const status_id = ref.resolve('ContactSearchStatus', a.statut ?? 'en_cours') as number;
      const res = await contactsApi.createSearch({ contact_id: a.contact_id, status_id, data });
      return { ok: true, recherches_du_contact: (Array.isArray(res) ? res : []).map(present.search) };
    }),
  );

  server.registerTool(
    'update_search',
    {
      title: 'Modifier une recherche acheteur',
      description:
        "Modifie une recherche : seuls les critères fournis changent (null = remettre à « indifférent »). Purge aussi les clés hors format. Sert à clôturer une recherche (statut « Terminée »).",
      inputSchema: {
        contact_id: z.number().int(),
        id: z.number().int().describe('Id de la recherche (voir get_contact).'),
        statut: refIn('ContactSearchStatus').optional(),
        ...criteriaShape,
      },
    },
    handler(async (a) => {
      const current = await findSearch(a.contact_id, a.id);
      const data = toApiData(pickCriteria(a), current.data ?? {});
      const status_id = a.statut !== undefined ? (ref.resolve('ContactSearchStatus', a.statut) as number) : current.status_id;
      const res = await contactsApi.createSearch({ id: a.id, contact_id: a.contact_id, status_id, data });
      return { ok: true, recherches_du_contact: (Array.isArray(res) ? res : []).map(present.search) };
    }),
  );

  server.registerTool(
    'find_matching_proprietes',
    {
      title: 'Biens correspondant à une recherche',
      description:
        "Matching contact → biens : liste les biens correspondant à une recherche enregistrée (contact_id + search_id) — même calcul que le CRM. Par défaut : biens disponibles de l'agence uniquement.",
      inputSchema: {
        contact_id: z.number().int(),
        search_id: z.number().int(),
        disponibles_seulement: z.boolean().default(true),
        inclure_annonces: z.boolean().default(false).describe('Inclure les annonces scrapées (hors mandats).'),
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const s = await findSearch(a.contact_id, a.search_id);
      const res = await proprietesApi.listV2({
        filters: proprieteFilters(expandVilles(s.data ?? {}), a),
        sort: { key: 'date_update', value: 'DESC' },
        limit: a.limit,
        page: a.page,
      });
      return {
        recherche: present.search(s),
        ...page(res, a.limit),
        biens: res.data.map((p) => present.propriete(p as Propriete & { origine_id?: number })),
      };
    }),
  );

  server.registerTool(
    'find_buyers',
    {
      title: 'Acheteurs potentiels d’un bien',
      description:
        "Matching bien → contacts : recherches acheteur compatibles avec un bien (même calcul que le CRM), avec le nom et le téléphone du contact quand il est dans le périmètre de l'utilisateur.",
      inputSchema: {
        propriete_id: z.number().int(),
        recherches_actives_seulement: z.boolean().default(true),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const [d, res] = await Promise.all([
        proprietesApi.get(a.propriete_id),
        mcpApi.buyers(a.propriete_id, a.recherches_actives_seulement),
      ]);
      const list = Array.isArray(res) ? res : [];
      return {
        bien: present.propriete(d.propriete),
        total: list.length,
        acheteurs: list.slice(0, a.limit).map(withContact),
      };
    }),
  );

  const listFilters = {
    statut: refs('ContactSearchStatus', 'Défaut : « En cours ».').optional(),
    villes: z.array(z.string()).optional().describe('Villes recherchées (ex. ["Tel Aviv"]).'),
    quartiers: z.array(z.union([z.number().int(), z.string()])).optional(),
    transaction: refs('ProprieteTransaction', '"Vente"/"achat" ou "Location".').optional(),
    types_bien: refs('ProprieteBien').optional(),
    agent: refs('User', 'Agent du contact.').optional(),
    contact_id: z.number().int().optional(),
    prix: z.number().optional().describe('Ne garder que les recherches dont le budget inclut ce prix (₪).'),
    pieces: z.number().optional().describe('Ne garder que les recherches compatibles avec ce nombre de pièces.'),
    cree_du: day.optional(),
    cree_au: day.optional(),
    inclure_indifferent: z
      .boolean()
      .default(true)
      .describe('true = une recherche sans critère sur la ville/transaction/type compte aussi (elle accepte tout).'),
  };

  type ListFilterArgs = { [K in keyof typeof listFilters]?: unknown };

  /** Filtres outil → filtres de /mcp/search/*. Villes : toutes les graphies connues. */
  const toFilters = (a: ListFilterArgs): Record<string, unknown> => {
    const f: Record<string, unknown> = {
      status_id: ref.resolveMany('ContactSearchStatus', a.statut ?? 'en_cours'),
      inclure_indifferent: a.inclure_indifferent !== false,
    };
    if (a.villes !== undefined) f.villes = villeVariants(a.villes as string[]);
    if (a.quartiers !== undefined) f.quartier_id = ref.resolveMany('Quartier', a.quartiers);
    if (a.transaction !== undefined) f.transaction_id = ref.resolveMany('ProprieteTransaction', a.transaction);
    if (a.types_bien !== undefined) f.bien_id = ref.resolveMany('ProprieteBien', a.types_bien);
    if (a.agent !== undefined) f.contact_user_id = ref.resolveMany('User', a.agent);
    if (a.contact_id !== undefined) f.contact_id = a.contact_id;
    if (a.prix !== undefined) f.prix = a.prix;
    if (a.pieces !== undefined) f.pieces = a.pieces;
    if (a.cree_du) f.min_date_create = dayToEpoch(a.cree_du as string);
    if (a.cree_au) f.max_date_create = dayToEpoch(a.cree_au as string, true);
    return f;
  };

  server.registerTool(
    'list_searches',
    {
      title: 'Lister les recherches acheteur',
      description:
        "Recherches acheteur de TOUS les contacts du périmètre, filtrables par statut (défaut « En cours »), ville, quartier, transaction, type de bien, agent, budget compatible avec un prix, pièces, date. Chaque résultat inclut le contact (nom, téléphone, statut, agent). Pour un simple comptage, préfère search_stats.",
      inputSchema: {
        ...listFilters,
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const res = await mcpApi.searchList({
        filters: toFilters(a),
        sort: { key: 'date_update', value: 'DESC' },
        limit: a.limit,
        page: a.page,
      });
      return { ...page(res, a.limit), recherches: res.data.map(withContact) };
    }),
  );

  server.registerTool(
    'search_stats',
    {
      title: 'Statistiques des recherches acheteur',
      description:
        "Compte les recherches acheteur (défaut : « En cours ») avec les mêmes filtres que list_searches, et donne la répartition par ville, type de transaction et statut. Ex. « combien de recherches en cours sur Tel Aviv ? ».",
      inputSchema: listFilters,
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const s = await mcpApi.searchStats(toFilters(a));
      return {
        total: s.total,
        par_ville: (s.par_ville ?? []).map((x) => ({ ville: x._id, nb: x.n })),
        par_transaction: (s.par_transaction ?? []).map((x) => ({
          transaction: x._id ? ref.pair('ProprieteTransaction', x._id) : { id: null, label: 'Indifférent' },
          nb: x.n,
        })),
        par_statut: (s.par_statut ?? []).map((x) => ({ statut: ref.pair('ContactSearchStatus', x._id), nb: x.n })),
        ...(a.inclure_indifferent !== false && (a.villes || a.transaction || a.types_bien)
          ? { note: 'Inclut les recherches sans critère sur ces champs (elles acceptent tout). inclure_indifferent=false pour les exclure.' }
          : {}),
      };
    }),
  );
}

/** Toutes les graphies connues d'une ville (ex. « Tel Aviv-Yafo », « Tel Aviv-Jaffa », « תל אביב-יפו »). */
const VILLE_ALIASES: string[][] = [['Tel Aviv-Yafo', 'Tel Aviv-Jaffa', 'תל אביב-יפו', 'Tel Aviv', 'Tel-Aviv']];

export function villeVariants(villes: string[]): string[] {
  const out = new Set<string>();
  for (const v of villes) {
    let resolved: string;
    try {
      resolved = String(ref.resolve('Ville', v));
    } catch {
      resolved = v;
    }
    out.add(resolved);
    for (const group of VILLE_ALIASES) {
      if (group.some((g) => norm(g) === norm(resolved) || norm(g) === norm(v))) group.forEach((g) => out.add(g));
    }
  }
  return [...out];
}

/** Étend le critère ville d'un `data` API à toutes les graphies connues (lecture seule). */
export function expandVilles(data: Record<string, unknown>): Record<string, unknown> {
  const v = data['adresse.locality'];
  if (!Array.isArray(v) || !v.length) return data;
  return { ...data, 'adresse.locality': villeVariants(v.map(String)) };
}

/** Recherche + contact embarqué (renvoyé par les routes /mcp du back). */
function withContact(s: SearchWithContact) {
  const c = s.contact;
  return {
    contact: c
      ? {
          id: c.id,
          nom: present.fullName(c),
          telephone: c.telephone || c.mobile || null,
          statut: ref.pair('ContactStatus', c.status_id),
          agent: present.agent(c.user_id),
        }
      : { id: s.contact_id },
    recherche: present.search(s),
    modifiee_le: epochToLocal(s.date_update),
  };
}
