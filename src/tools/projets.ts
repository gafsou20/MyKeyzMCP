import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as projetsApi from '../api/projets.js';
import * as contactsApi from '../api/contacts.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { escapeRegex } from '../core/text.js';
import { ToolError } from '../core/errors.js';
import { handler, page } from './run.js';
import { adresseSchema, ref as refIn, refs } from './schemas.js';
import type { Contact, Projet } from '../types/models.js';

const editable = {
  nom: z.string().optional(),
  promoteur: z.string().nullable().optional().describe('Nom commercial du promoteur.'),
  constructeur: z.string().nullable().optional(),
  statut: refIn('ProjetStatus', 'Ex. "Pré-vente", "En commercialisation", "Sold out".').optional(),
  type: refIn('ProjetType').nullable().optional(),
  pre_type: refIn('ProjetPreType', 'Habitation / Commercial.').nullable().optional(),
  permis: refIn('ProjetPermis', '"Obtenu" / "En cours d’obtention".').nullable().optional(),
  caracteristiques: refs('ProjetCaracteristique', 'Ex. ["Piscine", "Parking souterrain"]. Remplace la liste.').optional(),
  date_livraison: z.string().regex(/^\d{4}-\d{2}$/, 'Format YYYY-MM').nullable().optional().describe('Mois de livraison (YYYY-MM).'),
  prix_min: z.number().nullable().optional(),
  prix_max: z.number().nullable().optional(),
  pieces_min: z.number().nullable().optional(),
  pieces_max: z.number().nullable().optional(),
  garantie_bancaire: z.string().nullable().optional().describe('Banque garante (null = pas de garantie).'),
  luxe: z.boolean().optional(),
  sur_site_web: z.boolean().optional(),
  commentaire: z.string().nullable().optional(),
  adresse: adresseSchema.optional(),
};
type EditableInput = { [K in keyof typeof editable]?: z.infer<(typeof editable)[K]> };

function toPayload(a: EditableInput, current?: Partial<Projet>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const direct: [keyof EditableInput, string][] = [
    ['nom', 'nom'],
    ['promoteur', 'promoteur'],
    ['constructeur', 'constructeur'],
    ['date_livraison', 'date_livraison'],
    ['prix_min', 'prix_min'],
    ['prix_max', 'prix_max'],
    ['pieces_min', 'nb_pieces_min'],
    ['pieces_max', 'nb_pieces_max'],
    ['luxe', 'luxe'],
    ['sur_site_web', 'website'],
    ['commentaire', 'commentaire'],
  ];
  for (const [k, api] of direct) if (a[k] !== undefined) p[api] = a[k];
  if (a.statut !== undefined) p.status_id = ref.resolve('ProjetStatus', a.statut);
  if (a.type !== undefined) p.type_id = ref.resolveOpt('ProjetType', a.type);
  if (a.pre_type !== undefined) p.pre_type_id = ref.resolveOpt('ProjetPreType', a.pre_type);
  if (a.permis !== undefined) p.permis = ref.resolveOpt('ProjetPermis', a.permis);
  if (a.caracteristiques !== undefined) p.caracteristique_id = ref.resolveMany('ProjetCaracteristique', a.caracteristiques);
  if (a.garantie_bancaire !== undefined) {
    p.garantie = Boolean(a.garantie_bancaire);
    p.garantie_name = a.garantie_bancaire;
  }
  if (a.adresse !== undefined) {
    const adr: Record<string, unknown> = { ...(current?.adresse ?? {}), ...a.adresse };
    if (a.adresse.quartier_id !== undefined) adr.quartier_id = ref.resolveOpt('Quartier', a.adresse.quartier_id);
    p.adresse = adr;
  }
  return p;
}

function clean<T extends object>(o: T): Record<string, unknown> {
  const { _id, titre, ...rest } = o as Record<string, unknown>;
  void _id;
  void titre;
  return rest;
}

/** Contact promoteur : l'API le (ré)enregistre à chaque sauvegarde du projet → on renvoie la fiche complète. */
async function promoterContact(contact_id: number): Promise<Record<string, unknown>> {
  const c: Contact = (await contactsApi.get(contact_id)).contact;
  return clean(c);
}

export function registerProjetTools(server: McpServer): void {
  server.registerTool(
    'list_projets',
    {
      title: 'Lister les projets neufs',
      description: 'Programmes immobiliers neufs. Filtres : nom, statut, type (ids ou libellés).',
      inputSchema: {
        nom: z.string().optional(),
        statut: refs('ProjetStatus').optional(),
        type: refs('ProjetType').optional(),
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const f: Record<string, unknown> = {};
      if (a.nom) f.nom = escapeRegex(a.nom.trim());
      if (a.statut !== undefined) f.status_id = ref.resolveMany('ProjetStatus', a.statut);
      if (a.type !== undefined) f.type_id = ref.resolveMany('ProjetType', a.type);
      const res = await projetsApi.list({ filters: f, sort: { key: 'id', value: 'DESC' }, limit: a.limit, page: a.page });
      return { ...page(res, a.limit), projets: res.data.map(present.projet) };
    }),
  );

  server.registerTool(
    'get_projet',
    {
      title: 'Fiche projet',
      description: 'Fiche d’un projet neuf : caractéristiques, permis, promoteur (contact) et lots (biens rattachés).',
      inputSchema: { id: z.number().int() },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ id }) => {
      const d = await projetsApi.get(id);
      return {
        projet: present.projetDetail(d.projet),
        contact_promoteur: d.contact
          ? { id: d.contact.id, nom: present.fullName(d.contact), categorie: ref.pair('ContactCategorie', d.contact.categorie_id) }
          : null,
        lots: (d.proprietes ?? []).map(present.propriete),
      };
    }),
  );

  server.registerTool(
    'create_projet',
    {
      title: 'Créer un projet neuf',
      description:
        "Crée un projet. `contact_promoteur_id` = contact existant de catégorie Promoteur ou Meshavek (le créer avant via create_contact si besoin). Statut « Pré-vente » par défaut.",
      inputSchema: {
        contact_promoteur_id: z.number().int(),
        ...editable,
        nom: z.string().min(1),
      },
    },
    handler(async ({ contact_promoteur_id, ...a }) => {
      const contact = await promoterContact(contact_promoteur_id);
      const projet = toPayload({ ...a, statut: a.statut ?? 'Pré-vente' });
      const saved = await projetsApi.create(projet as Partial<Projet>, contact as Partial<Contact>);
      return { ok: true, projet: present.projetDetail(saved.projet) };
    }),
  );

  server.registerTool(
    'update_projet',
    {
      title: 'Modifier un projet neuf',
      description: 'Modifie un projet : seuls les champs fournis changent (fusion avec la fiche).',
      inputSchema: { id: z.number().int(), ...editable },
    },
    handler(async ({ id, ...a }) => {
      if (!Object.values(a).some((v) => v !== undefined)) throw new ToolError('Aucun champ à modifier.');
      const d = await projetsApi.get(id);
      if (!d.contact) throw new ToolError('Projet sans contact promoteur accessible : modification impossible via le MCP (à faire dans le CRM).');
      const projet = { ...clean(d.projet), ...toPayload(a, d.projet), id };
      const saved = await projetsApi.create(projet as Partial<Projet>, clean(d.contact) as Partial<Contact>);
      return { ok: true, projet: present.projetDetail(saved.projet) };
    }),
  );
}
