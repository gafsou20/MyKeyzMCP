import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as agendaApi from '../api/agenda.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { structured } from './respond.js';
import { agendaEvent, agendaList, agendaSearch, genericResult } from './outputs.js';
import type { AgendaEvent } from '../types/models.js';

function présenter(e: AgendaEvent) {
  return {
    id: e.id,
    titre: e.data?.titre,
    date: e.data?.date,
    heure: e.data?.heure,
    categorie: ref.label('AgendaCategorie', e.data?.categorie_id) || e.data?.categorie_id,
    telephone: e.data?.telephone ?? null,
    description: e.data?.description ?? null,
    rattachement: e.model && e.model_id ? { type: e.model, id: e.model_id } : null,
    agent: ref.label('User', e.user_id) || e.user_id,
  };
}

export function registerAgendaTools(server: McpServer): void {
  server.registerTool(
    'list_agenda',
    {
      description:
        "Liste les RDV/événements de l'agenda, triés par date. Ids résolus : catégorie←AgendaCategorie, agent←User. `rattachement` indique l'entité liée (Contact/Propriete).",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50),
        page: z.number().int().min(1).default(1),
      },
      outputSchema: agendaList,
      annotations: { readOnlyHint: true },
    },
    async ({ limit, page }) => {
      await ref.ensureLoaded();
      const res = await agendaApi.list(
        defaultListQuery({ sort: { key: 'dateO', value: 'ASC' }, limit, page }),
      );
      return structured({
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        evenements: res.data.map(présenter),
      });
    },
  );

  server.registerTool(
    'search_agenda',
    {
      description: "Recherche d'événements d'agenda par texte (titre).",
      inputSchema: { query: z.string().min(1).describe('Texte recherché dans les événements.') },
      outputSchema: agendaSearch,
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      await ref.ensureLoaded();
      const res = await agendaApi.search(query);
      return structured({ count: res.length, evenements: res.map(présenter) });
    },
  );

  // ── Écritures ──────────────────────────────────────────────────────────────

  server.registerTool(
    'create_event',
    {
      description:
        "Crée un RDV/événement (ou MAJ si `id`). `categorie_id` provient du référentiel AgendaCategorie → list_referentials('AgendaCategorie'). Rattachable à un Contact ou une Propriete via `model` + `model_id`.",
      inputSchema: {
        id: z.number().int().optional().describe('Présent = mise à jour.'),
        titre: z.string().describe('Titre du RDV.'),
        date: z.string().describe('Date au format YYYY-MM-DD.'),
        heure: z.string().optional().describe('Heure au format HH:MM.'),
        categorie_id: z.number().int().describe('Catégorie (référentiel AgendaCategorie).'),
        description: z.string().nullable().optional(),
        telephone: z.string().nullable().optional(),
        url: z.string().nullable().optional(),
        model: z.enum(['Contact', 'Propriete']).optional().describe("Type d'entité rattachée."),
        model_id: z.number().int().optional().describe("Id de l'entité rattachée."),
      },
      outputSchema: agendaEvent,
    },
    async ({ id, titre, date, heure, categorie_id, description, telephone, url, model, model_id }) => {
      await ref.ensureLoaded();
      const saved = await agendaApi.create({
        ...(id ? { id } : {}),
        ...(model && model_id ? { model, model_id } : {}),
        data: {
          titre,
          date,
          heure: heure ?? null,
          categorie_id,
          description: description ?? null,
          telephone: telephone ?? null,
          url: url ?? null,
        },
      });
      return structured(présenter(saved));
    },
  );

  server.registerTool(
    'delete_event',
    {
      description: '⚠️ Supprime définitivement un événement/RDV (suppression dure, irréversible).',
      inputSchema: { id: z.number().int().describe("Identifiant de l'événement à supprimer.") },
      outputSchema: genericResult,
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const res = await agendaApi.remove(id);
      return structured({ ok: true, message: typeof res === 'string' ? res : 'deleted', result: res });
    },
  );
}
