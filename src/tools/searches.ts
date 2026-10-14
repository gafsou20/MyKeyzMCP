import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import * as proprietesApi from '../api/proprietes.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { toApiData } from '../domain/criteria.js';
import { ToolError } from '../core/errors.js';
import { handler, page } from './run.js';
import { criteriaShape, criteriaSchema, ref as refIn, type CriteriaInput } from './schemas.js';
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
        filters: proprieteFilters(s.data ?? {}, a),
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
      const d = await proprietesApi.get(a.propriete_id);
      const active = ref.resolve('ContactSearchStatus', 'en_cours');
      let searchs = d.searchs ?? [];
      if (a.recherches_actives_seulement) searchs = searchs.filter((s) => s.status_id === active);
      const shown = searchs.slice(0, a.limit);
      const contacts = await Promise.all(
        shown.map((s) =>
          s.contact_id
            ? contactsApi.get(s.contact_id).then((r) => r.contact).catch(() => null)
            : Promise.resolve(null),
        ),
      );
      return {
        bien: present.propriete(d.propriete),
        total: searchs.length,
        acheteurs: shown.map((s, i) => ({
          contact: contacts[i]
            ? {
                id: contacts[i]!.id,
                nom: present.fullName(contacts[i]),
                telephone: contacts[i]!.telephone || contacts[i]!.mobile || null,
                statut: ref.pair('ContactStatus', contacts[i]!.status_id),
                agent: present.agent(contacts[i]!.user_id),
              }
            : { id: s.contact_id, nom: null, note: 'hors périmètre de l’utilisateur' },
          recherche: present.search(s),
        })),
      };
    }),
  );
}
