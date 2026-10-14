import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as contactsApi from '../api/contacts.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { dayToEpoch } from '../core/dates.js';
import { escapeRegex } from '../core/text.js';
import { ToolError } from '../core/errors.js';
import { handler, page } from './run.js';
import { ref as refIn, refs, day } from './schemas.js';
import type { Contact } from '../types/models.js';

/** Champs éditables d'un contact (entrée métier → champ API). */
const editable = {
  prenom: z.string().nullable().optional(),
  nom: z.string().nullable().optional(),
  societe: z.string().nullable().optional().describe('Société.'),
  telephone: z.string().nullable().optional().describe('Téléphone principal, format international (+972…). Sert au contrôle de doublon.'),
  mobile: z.string().nullable().optional().describe('Second téléphone.'),
  email: z.string().nullable().optional(),
  budget: z.number().nullable().optional().describe('Budget (₪).'),
  important: z.boolean().optional(),
  statut: refIn('ContactStatus', 'Ex. "Nouveau lead", "NRP", "À rappeler", "En cours".').optional(),
  categorie: refIn('ContactCategorie', 'client | prestataire | proprietaire (meshavek/promoteur réservés aux projets).').optional(),
  categorie_option: refIn('ContactCategorieOption', 'Dépend de la catégorie (client → achat/location ; proprietaire → bien à vendre/à louer…).').nullable().optional(),
  source: refIn('ContactSource', 'Ex. "Facebook", "YAD 2", "Site MyKeyz".').optional(),
  langue: refIn('Langue', 'Français / Hébreu / Anglais.').nullable().optional(),
  agent: refIn('User', 'Agent assigné : id ou nom.').optional(),
  description: z.string().nullable().optional(),
};
type EditableInput = { [K in keyof typeof editable]?: z.infer<(typeof editable)[K]> };

/** Entrée métier → payload API (seuls les champs fournis). */
function toPayload(a: EditableInput, current?: Partial<Contact>): Partial<Contact> {
  const p: Partial<Contact> = {};
  if (a.prenom !== undefined) p.prenom = a.prenom;
  if (a.nom !== undefined) p.nom = a.nom;
  if (a.societe !== undefined) p.socite = a.societe;
  if (a.telephone !== undefined) p.telephone = a.telephone;
  if (a.mobile !== undefined) p.mobile = a.mobile;
  if (a.email !== undefined) p.email = a.email;
  if (a.budget !== undefined) p.budget = a.budget;
  if (a.important !== undefined) p.important = a.important;
  if (a.description !== undefined) p.description = a.description;
  if (a.statut !== undefined) p.status_id = ref.resolve('ContactStatus', a.statut) as number;
  if (a.source !== undefined) p.source_id = ref.resolve('ContactSource', a.source) as number;
  if (a.langue !== undefined) p.langue_id = ref.resolveOpt('Langue', a.langue) as number | null;
  if (a.agent !== undefined) p.user_id = ref.resolve('User', a.agent) as number;
  if (a.categorie !== undefined) p.categorie_id = ref.resolve('ContactCategorie', a.categorie) as number;
  const categorie = p.categorie_id ?? current?.categorie_id ?? null;
  if (a.categorie_option !== undefined) {
    p.categorie_option_id = ref.resolveOpt('ContactCategorieOption', a.categorie_option, categorie) as number | null;
  } else if (p.categorie_id !== undefined && current?.categorie_option_id != null) {
    // Catégorie changée : l'ancienne option n'est plus valide si elle dépend d'une autre catégorie.
    const opt = ref.item('ContactCategorieOption', current.categorie_option_id);
    if (opt && opt.categorie_id !== p.categorie_id) p.categorie_option_id = null;
  }
  return p;
}

/** Retire les champs techniques avant renvoi à l'API. */
function clean(c: Record<string, unknown>): Record<string, unknown> {
  const { _id, titre, ...rest } = c;
  void _id;
  void titre;
  return rest;
}

/**
 * Mise à jour sûre : l'API remplace les champs reçus et réécrit `old_user` à
 * partir de la requête. On renvoie donc la fiche COMPLÈTE fusionnée, comme le
 * fait le CRM, pour ne rien perdre (historique des agents notamment).
 */
async function mergeUpdate(id: number, a: EditableInput): Promise<Contact> {
  const current = (await contactsApi.get(id)).contact;
  const changes = toPayload(a, current);
  return contactsApi.create({ ...(clean(current as unknown as Record<string, unknown>) as Partial<Contact>), ...changes, id });
}

export function registerContactTools(server: McpServer): void {
  server.registerTool(
    'list_contacts',
    {
      title: 'Lister / filtrer les contacts',
      description:
        "Recherche de contacts (prospects, clients, propriétaires, prestataires) avec filtres combinables. Les filtres de référentiel acceptent ids ou libellés (ex. statut: \"NRP\", agent: \"David\"). Chaque résultat renvoie les jointures en { id, label }. Périmètre : contacts des agents visibles par l'utilisateur.",
      inputSchema: {
        texte: z.string().optional().describe('Nom, prénom ou société (contient).'),
        telephone: z.string().optional().describe('Numéro (les 8 derniers chiffres suffisent).'),
        statut: refs('ContactStatus').optional(),
        categorie: refs('ContactCategorie').optional(),
        source: refs('ContactSource').optional(),
        agent: refs('User', 'Agent(s) assigné(s).').optional(),
        important: z.boolean().optional(),
        cree_du: day.optional().describe('Créé à partir du (YYYY-MM-DD).'),
        cree_au: day.optional(),
        modifie_du: day.optional().describe('Modifié à partir du (YYYY-MM-DD).'),
        modifie_au: day.optional(),
        tri: z.enum(['recent', 'modifie', 'ancien']).default('recent').describe('recent = derniers créés ; modifie = derniers modifiés.'),
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const f: Record<string, unknown> = {};
      if (a.texte) f.titre = escapeRegex(a.texte.trim());
      if (a.telephone) {
        const digits = a.telephone.replace(/\D/g, '');
        f.telephone = digits.length >= 8 ? digits.slice(-8) : escapeRegex(a.telephone);
      }
      if (a.statut !== undefined) f.status_id = ref.resolveMany('ContactStatus', a.statut);
      if (a.categorie !== undefined) f.categorie_id = ref.resolveMany('ContactCategorie', a.categorie);
      if (a.source !== undefined) f.source_id = ref.resolveMany('ContactSource', a.source);
      if (a.agent !== undefined) f.user_id = ref.resolveMany('User', a.agent);
      if (a.important !== undefined) f.important = a.important;
      if (a.cree_du) f.min_date_create = dayToEpoch(a.cree_du);
      if (a.cree_au) f.max_date_create = dayToEpoch(a.cree_au, true);
      if (a.modifie_du) f.min_date_update = dayToEpoch(a.modifie_du);
      if (a.modifie_au) f.max_date_update = dayToEpoch(a.modifie_au, true);
      const sort =
        a.tri === 'modifie'
          ? { key: 'date_update', value: 'DESC' as const }
          : { key: 'id', value: a.tri === 'ancien' ? ('ASC' as const) : ('DESC' as const) };
      const res = await contactsApi.list({ filters: f, sort, limit: a.limit, page: a.page });
      return { ...page(res, a.limit), contacts: res.data.map(present.contact) };
    }),
  );

  server.registerTool(
    'get_contact',
    {
      title: 'Fiche contact complète',
      description:
        "Fiche d'un contact avec TOUT son contexte : coordonnées, jointures { id, label }, recherches acheteur (critères + nb de biens correspondants), biens dont il est propriétaire, projets, RDV, notes (commentaires) et ancien historique texte.",
      inputSchema: { id: z.number().int().describe('Id du contact.') },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ id }) => {
      const d = await contactsApi.get(id);
      return {
        contact: present.contactDetail(d.contact),
        recherches: (d.searchs ?? []).map(present.search),
        biens_proprietaire: (d.proprietes ?? []).map(present.propriete),
        projets: (d.projets ?? []).map(present.projet),
        rdv: (d.agenda ?? []).map(present.event),
        notes: (d.commentaires ?? []).map(present.comment),
      };
    }),
  );

  server.registerTool(
    'create_contact',
    {
      title: 'Créer un contact',
      description:
        "Crée un contact. `categorie` obligatoire ; `statut` = « Nouveau lead » et `source` = « Creation » par défaut. Les référentiels acceptent ids ou libellés. L'API refuse les doublons de téléphone et renvoie l'id existant : dans ce cas utilise get_contact / update_contact. ACL 13.",
      inputSchema: { ...editable, categorie: refIn('ContactCategorie', 'client | prestataire | proprietaire.') },
    },
    handler(async (a) => {
      const payload = toPayload({
        ...a,
        statut: a.statut ?? 'nouveau_lead',
        source: a.source ?? 'Creation',
      });
      const wantedAgent = payload.user_id;
      delete payload.user_id; // l'API assigne d'office le créateur
      let saved = await contactsApi.create(payload);
      if (wantedAgent !== undefined && wantedAgent !== saved.user_id) {
        saved = await mergeUpdate(saved.id, { agent: wantedAgent });
      }
      return { ok: true, contact: present.contactDetail(saved) };
    }),
  );

  server.registerTool(
    'update_contact',
    {
      title: 'Modifier un contact',
      description:
        "Modifie un contact : seuls les champs fournis changent (fusion avec la fiche existante, l'historique des agents est conservé). Changer `agent` réassigne le contact. ACL 14 (statut 15, agent 16).",
      inputSchema: { id: z.number().int().describe('Id du contact.'), ...editable },
    },
    handler(async ({ id, ...a }) => {
      if (!Object.values(a).some((v) => v !== undefined)) throw new ToolError('Aucun champ à modifier.');
      const saved = await mergeUpdate(id, a);
      return { ok: true, contact: present.contactDetail(saved) };
    }),
  );

  server.registerTool(
    'set_contact_status',
    {
      title: 'Changer le statut d’un contact',
      description: 'Raccourci : change le statut (ex. "NRP", "À rappeler", "Client MyKeyz"). Ajoute éventuellement une note expliquant le changement. ACL 15.',
      inputSchema: {
        id: z.number().int().describe('Id du contact.'),
        statut: refIn('ContactStatus'),
        note: z.string().optional().describe('Note ajoutée au contact (ex. résultat de l’appel).'),
      },
    },
    handler(async ({ id, statut, note }) => {
      const saved = await mergeUpdate(id, { statut });
      if (note) await contactsApi.addComment(id, note);
      return { ok: true, contact: present.contact(saved), note_ajoutee: Boolean(note) };
    }),
  );

  server.registerTool(
    'add_contact_note',
    {
      title: 'Ajouter une note',
      description: "Ajoute une note datée sur un contact (compte-rendu d'appel, info client…), signée par l'utilisateur connecté. `note_id` = modifier une note existante.",
      inputSchema: {
        contact_id: z.number().int(),
        texte: z.string().min(1),
        note_id: z.number().int().optional(),
      },
    },
    handler(async ({ contact_id, texte, note_id }) => {
      const saved = await contactsApi.addComment(contact_id, texte, note_id);
      return { ok: true, note: present.comment(saved) };
    }),
  );
}
