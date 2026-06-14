import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as agendaApi from '../api/agenda.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
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
  server.tool(
    'list_agenda',
    "Liste les événements / rendez-vous de l'agenda MyKeyz, triés par date.",
    {
      limit: z.number().int().min(1).max(200).default(50),
      page: z.number().int().min(1).default(1),
    },
    async ({ limit, page }) => {
      await ref.ensureLoaded();
      const res = await agendaApi.list(
        defaultListQuery({ sort: { key: 'dateO', value: 'ASC' }, limit, page }),
      );
      const payload = {
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        evenements: res.data.map(présenter),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'search_agenda',
    "Recherche d'événements d'agenda par texte (titre).",
    {
      query: z.string().min(1).describe('Texte recherché dans les événements.'),
    },
    async ({ query }) => {
      await ref.ensureLoaded();
      const res = await agendaApi.search(query);
      const payload = { count: res.length, evenements: res.map(présenter) };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
