import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as agendaApi from '../api/agenda.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { dayToUtcEpoch, today } from '../core/dates.js';
import { ToolError } from '../core/errors.js';
import { handler } from './run.js';
import { day, ref as refIn, refs } from './schemas.js';
import type { AgendaEvent } from '../types/models.js';

const heure = z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM');
const rattachement = z
  .object({ type: z.enum(['Contact', 'Propriete']), id: z.number().int() })
  .describe('Fiche liée au RDV (contact ou bien).');

export function registerAgendaTools(server: McpServer): void {
  server.registerTool(
    'list_agenda',
    {
      title: 'Agenda de l’utilisateur',
      description:
        "RDV de l'agenda de l'utilisateur connecté, triés chronologiquement, filtrables par période (dates en heure d'Israël), catégorie et fiche rattachée. Par défaut : à partir d'aujourd'hui.",
      inputSchema: {
        du: day.optional().describe("À partir du (YYYY-MM-DD). Défaut : aujourd'hui."),
        au: day.optional().describe('Jusqu’au (YYYY-MM-DD, inclus).'),
        categorie: refs('AgendaCategorie').optional(),
        rattachement: rattachement.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const f: Record<string, unknown> = {};
      f['min_data.time'] = dayToUtcEpoch(a.du ?? today());
      if (a.au) f['max_data.time'] = dayToUtcEpoch(a.au);
      if (a.categorie !== undefined) f['data.categorie_id'] = ref.resolveMany('AgendaCategorie', a.categorie);
      if (a.rattachement) {
        f.model = [a.rattachement.type];
        f.model_id = [a.rattachement.id];
      }
      // L'API renvoie tout l'agenda filtré (pas de pagination serveur).
      const res = await agendaApi.list({ filters: f, sort: { key: 'dateO', value: 'ASC' } });
      const all = res.data ?? [];
      const start = (a.page - 1) * a.limit;
      const slice = all.slice(start, start + a.limit);
      return {
        total: all.length,
        page: a.page,
        count: slice.length,
        ...(start + a.limit < all.length ? { page_suivante: a.page + 1 } : {}),
        rdv: slice.map(present.event),
      };
    }),
  );

  server.registerTool(
    'search_agenda',
    {
      title: 'Rechercher un RDV',
      description: "Recherche texte dans les RDV de l'utilisateur (titre).",
      inputSchema: { texte: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ texte }) => {
      const res = await agendaApi.search(texte);
      const list = Array.isArray(res) ? res : [];
      return { count: list.length, rdv: list.map(present.event) };
    }),
  );

  server.registerTool(
    'create_event',
    {
      title: 'Créer un RDV',
      description:
        "Crée un RDV dans l'agenda de l'utilisateur connecté, éventuellement rattaché à un contact ou un bien (apparaît alors sur la fiche).",
      inputSchema: {
        titre: z.string().min(1),
        date: day.describe('YYYY-MM-DD (heure d’Israël).'),
        heure: heure.optional(),
        categorie: refIn('AgendaCategorie', '"Client important" / "Relance client".'),
        description: z.string().nullable().optional(),
        telephone: z.string().nullable().optional(),
        rattachement: rattachement.optional(),
      },
    },
    handler(async (a) => {
      const saved = await agendaApi.create({
        ...(a.rattachement ? { model: a.rattachement.type, model_id: a.rattachement.id } : {}),
        data: {
          titre: a.titre,
          date: a.date,
          heure: a.heure ?? '09:00',
          categorie_id: ref.resolve('AgendaCategorie', a.categorie) as number,
          description: a.description ?? null,
          telephone: a.telephone ?? null,
          url: null,
        },
      });
      return { ok: true, rdv: present.event(saved) };
    }),
  );

  server.registerTool(
    'update_event',
    {
      title: 'Modifier un RDV',
      description: 'Modifie un RDV (déplacer, renommer, changer de catégorie…) : seuls les champs fournis changent.',
      inputSchema: {
        id: z.number().int(),
        titre: z.string().optional(),
        date: day.optional(),
        heure: heure.optional(),
        categorie: refIn('AgendaCategorie').optional(),
        description: z.string().nullable().optional(),
        telephone: z.string().nullable().optional(),
      },
    },
    handler(async ({ id, categorie, ...a }) => {
      const current: AgendaEvent = await agendaApi.get(id);
      const data = { ...current.data };
      for (const [k, v] of Object.entries(a)) if (v !== undefined) (data as Record<string, unknown>)[k] = v;
      if (categorie !== undefined) data.categorie_id = ref.resolve('AgendaCategorie', categorie) as number;
      if (JSON.stringify(data) === JSON.stringify(current.data)) throw new ToolError('Aucun champ à modifier.');
      const saved = await agendaApi.create({
        id,
        ...(current.model ? { model: current.model, model_id: current.model_id } : {}),
        data,
      });
      return { ok: true, rdv: present.event(saved) };
    }),
  );

  server.registerTool(
    'delete_event',
    {
      title: 'Supprimer un RDV',
      description: '⚠️ Supprime définitivement un RDV (irréversible). Confirme avec l’utilisateur avant.',
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    handler(async ({ id }) => {
      await agendaApi.remove(id);
      return { ok: true, supprime: id };
    }),
  );
}
