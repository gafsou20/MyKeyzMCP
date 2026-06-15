import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import type { Contact } from '../types/models.js';

/** Champs scalaires modifiables d'un contact (tous optionnels). */
const contactFields = {
  prenom: z.string().nullable().optional(),
  nom: z.string().nullable().optional(),
  socite: z.string().nullable().optional().describe('Société (orthographe API : socite).'),
  telephone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  budget: z.number().nullable().optional(),
  important: z.boolean().optional(),
  status_id: z.number().int().optional().describe('Statut (référentiel ContactStatus).'),
  source_id: z.number().int().optional().describe('Source (référentiel ContactSource).'),
  categorie_id: z.number().int().nullable().optional(),
  langue_id: z.number().int().nullable().optional(),
  user_id: z.number().int().optional().describe('Agent assigné (référentiel User).'),
  commentaire: z.string().nullable().optional(),
};

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

  // ── Écritures ──────────────────────────────────────────────────────────────

  server.tool(
    'create_contact',
    "Crée un contact, ou le met à jour si `id` est fourni. `status_id` et `categorie_id` sont OBLIGATOIRES (résoudre via les référentiels ContactStatus / ContactCategorie). Soumis à l'ACL (création 13 / modification 14).",
    {
      id: z.number().int().optional().describe('Présent = mise à jour ; absent = création.'),
      ...contactFields,
      status_id: z.number().int().describe('Statut (OBLIGATOIRE) — référentiel ContactStatus.'),
      categorie_id: z.number().int().describe('Catégorie (OBLIGATOIRE) — référentiel ContactCategorie.'),
    },
    async (args) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create(args as Partial<Contact> & { id?: number });
      return { content: [{ type: 'text', text: JSON.stringify(présenter(saved), null, 2) }] };
    },
  );

  server.tool(
    'set_contact_status',
    "Change le statut d'un contact (ACL 15).",
    {
      id: z.number().int().describe('Identifiant du contact.'),
      status_id: z.number().int().describe('Nouveau statut (référentiel ContactStatus).'),
    },
    async ({ id, status_id }) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create({ id, status_id });
      return { content: [{ type: 'text', text: JSON.stringify(présenter(saved), null, 2) }] };
    },
  );

  server.tool(
    'set_contact_agent',
    "Réassigne l'agent d'un contact (ACL 16).",
    {
      id: z.number().int().describe('Identifiant du contact.'),
      user_id: z.number().int().describe('Nouvel agent (référentiel User).'),
    },
    async ({ id, user_id }) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create({ id, user_id });
      return { content: [{ type: 'text', text: JSON.stringify(présenter(saved), null, 2) }] };
    },
  );

  server.tool(
    'add_contact_comment',
    'Ajoute une note/commentaire sur un contact (ou met à jour une note via `id`).',
    {
      contact_id: z.number().int().describe('Identifiant du contact.'),
      txt: z.string().min(1).describe('Texte de la note.'),
      id: z.number().int().optional().describe('Présent = édition de la note.'),
    },
    async ({ contact_id, txt, id }) => {
      const saved = await contactsApi.addComment(contact_id, txt, id);
      return { content: [{ type: 'text', text: JSON.stringify(saved, null, 2) }] };
    },
  );

  server.tool(
    'create_search',
    "Crée ou met à jour une recherche acheteur (critères) rattachée à un contact. `data` porte les critères libres (budget, localisation, nb pièces…).",
    {
      contact_id: z.number().int().describe('Contact propriétaire de la recherche.'),
      status_id: z.number().int().describe('Statut de la recherche (référentiel).'),
      data: z.record(z.unknown()).describe('Critères de recherche (objet libre).'),
      id: z.number().int().optional().describe('Présent = mise à jour.'),
    },
    async ({ contact_id, status_id, data, id }) => {
      const saved = await contactsApi.createSearch({ ...(id ? { id } : {}), contact_id, status_id, data });
      return { content: [{ type: 'text', text: JSON.stringify(saved, null, 2) }] };
    },
  );
}
