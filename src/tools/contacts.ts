import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import type { Contact } from '../types/models.js';

/** Projette un contact en objet compact et lisible (libellés résolus). */
function présenter(c: Contact) {
  return {
    id: c.id,
    nom: [c.prenom, c.nom, c.socite].filter(Boolean).join(' ').trim() || `#${c.id}`,
    telephone: c.telephone,
    mobile: c.mobile,
    email: c.email,
    statut: ref.label('ContactStatus', c.status_id) || c.status_id,
    source: ref.label('ContactSource', c.source_id) || c.source_id,
    agent: ref.label('User', c.user_id) || c.user_id,
    important: c.important,
    budget: c.budget,
  };
}

export function registerContactTools(server: McpServer): void {
  server.tool(
    'list_contacts',
    "Liste les contacts du CRM MyKeyz. Recherche texte optionnelle (nom, téléphone, email) et filtres simples. Renvoie des libellés résolus (statut, source, agent).",
    {
      search: z.string().optional().describe('Recherche texte (nom, téléphone, email…).'),
      important: z.boolean().optional().describe('Ne garder que les contacts marqués importants.'),
      limit: z.number().int().min(1).max(100).default(25).describe('Nombre de résultats (max 100).'),
      page: z.number().int().min(1).default(1).describe('Page (pagination).'),
    },
    async ({ search, important, limit, page }) => {
      await ref.ensureLoaded();
      const filters: Record<string, unknown> = {};
      if (search) filters.titre = search;
      if (important !== undefined) filters.important = important;

      const res = await contactsApi.list(defaultListQuery({ filters, limit, page }));
      const payload = {
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        contacts: res.data.map(présenter),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'get_contact',
    "Fiche détaillée d'un contact MyKeyz : coordonnées, recherches, biens, projets, RDV et commentaires liés (libellés résolus).",
    {
      id: z.number().int().describe('Identifiant du contact.'),
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const d = await contactsApi.get(id);
      const payload = {
        ...présenter(d.contact),
        categorie: ref.label('ContactCategorie', d.contact.categorie_id) || null,
        langue: ref.label('Langue', d.contact.langue_id) || null,
        commentaire: d.contact.commentaire,
        recherches: d.searchs?.length ?? 0,
        biens_lies: d.proprietes?.length ?? 0,
        projets_lies: d.projets?.length ?? 0,
        rdv: (d.agenda ?? []).map((e) => ({ titre: e.data?.titre, date: e.data?.date, heure: e.data?.heure })),
        commentaires: (d.commentaires ?? []).map((c) => ({
          texte: c.txt,
          auteur: ref.label('User', c.user_id) || c.user_id,
          date: c.date_create,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
