import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { structured } from './respond.js';
import {
  contactItem,
  contactList,
  contactDetail,
  commentOut,
  searchOut,
} from './outputs.js';
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
  server.registerTool(
    'list_contacts',
    {
      description:
        "Liste les contacts du CRM MyKeyz (recherche texte + filtres). Dans les résultats, les ids de jointure sont DÉJÀ résolus en libellés : statut←ContactStatus, source←ContactSource, agent←User. (Réfs consultables via list_referentials.)",
      inputSchema: {
        search: z.string().optional().describe('Recherche texte (nom, téléphone, email…).'),
        important: z.boolean().optional().describe('Ne garder que les contacts importants.'),
        limit: z.number().int().min(1).max(100).default(25).describe('Nombre de résultats (max 100).'),
        page: z.number().int().min(1).default(1).describe('Page (pagination).'),
      },
      outputSchema: contactList,
      annotations: { readOnlyHint: true },
    },
    async ({ search, important, limit, page }) => {
      await ref.ensureLoaded();
      const filters: Record<string, unknown> = {};
      if (search) filters.titre = search;
      if (important !== undefined) filters.important = important;
      const res = await contactsApi.list(defaultListQuery({ filters, limit, page }));
      return structured({
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        contacts: res.data.map(présenter),
      });
    },
  );

  server.registerTool(
    'get_contact',
    {
      description:
        "Fiche détaillée d'un contact : coordonnées, recherches, biens, projets, RDV et commentaires liés. Tous les ids sont résolus en libellés : statut←ContactStatus, source←ContactSource, catégorie←ContactCategorie, langue←Langue, agent/auteur←User.",
      inputSchema: { id: z.number().int().describe('Identifiant du contact.') },
      outputSchema: contactDetail,
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const d = await contactsApi.get(id);
      return structured({
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
      });
    },
  );

  // ── Écritures ──────────────────────────────────────────────────────────────

  server.registerTool(
    'create_contact',
    {
      description:
        "Crée un contact (ou le met à jour si `id` fourni). Les champs *_id pointent vers des référentiels : RÉSOUS-LES via list_referentials AVANT l'appel — status_id→ContactStatus, categorie_id→ContactCategorie (ces 2 sont OBLIGATOIRES), source_id→ContactSource, langue_id→Langue, user_id→User. ACL : création 13 / modification 14.",
      inputSchema: {
        id: z.number().int().optional().describe('Présent = mise à jour ; absent = création.'),
        ...contactFields,
        status_id: z.number().int().describe('Statut (OBLIGATOIRE) — référentiel ContactStatus.'),
        categorie_id: z.number().int().describe('Catégorie (OBLIGATOIRE) — référentiel ContactCategorie.'),
      },
      outputSchema: contactItem,
    },
    async (args) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create(args as Partial<Contact> & { id?: number });
      return structured(présenter(saved));
    },
  );

  server.registerTool(
    'set_contact_status',
    {
      description:
        "Change le statut d'un contact. `status_id` provient du référentiel ContactStatus → list_referentials('ContactStatus'). ACL 15.",
      inputSchema: {
        id: z.number().int().describe('Identifiant du contact.'),
        status_id: z.number().int().describe('Nouveau statut (référentiel ContactStatus).'),
      },
      outputSchema: contactItem,
    },
    async ({ id, status_id }) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create({ id, status_id });
      return structured(présenter(saved));
    },
  );

  server.registerTool(
    'set_contact_agent',
    {
      description:
        "Réassigne l'agent d'un contact. `user_id` provient du référentiel User → list_referentials('User'). ACL 16.",
      inputSchema: {
        id: z.number().int().describe('Identifiant du contact.'),
        user_id: z.number().int().describe('Nouvel agent (référentiel User).'),
      },
      outputSchema: contactItem,
    },
    async ({ id, user_id }) => {
      await ref.ensureLoaded();
      const saved = await contactsApi.create({ id, user_id });
      return structured(présenter(saved));
    },
  );

  server.registerTool(
    'add_contact_comment',
    {
      description: 'Ajoute une note/commentaire sur un contact (ou met à jour une note via `id`).',
      inputSchema: {
        contact_id: z.number().int().describe('Identifiant du contact.'),
        txt: z.string().min(1).describe('Texte de la note.'),
        id: z.number().int().optional().describe('Présent = édition de la note.'),
      },
      outputSchema: commentOut,
    },
    async ({ contact_id, txt, id }) => {
      const saved = await contactsApi.addComment(contact_id, txt, id);
      return structured({ ok: true, comment: saved });
    },
  );

  server.registerTool(
    'create_search',
    {
      description:
        "Crée/MAJ une recherche acheteur (critères) rattachée à un contact. `status_id` provient d'un référentiel (list_referentials). `data` = critères libres (budget, localité, nb pièces…).",
      inputSchema: {
        contact_id: z.number().int().describe('Contact propriétaire de la recherche.'),
        status_id: z.number().int().describe('Statut de la recherche (référentiel).'),
        data: z.record(z.unknown()).describe('Critères de recherche (objet libre).'),
        id: z.number().int().optional().describe('Présent = mise à jour.'),
      },
      outputSchema: searchOut,
    },
    async ({ contact_id, status_id, data, id }) => {
      const saved = await contactsApi.createSearch({ ...(id ? { id } : {}), contact_id, status_id, data });
      return structured({ ok: true, searches: saved });
    },
  );
}
