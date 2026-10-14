import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as proprietesApi from '../api/proprietes.js';
import * as ref from '../core/referentials.js';
import * as present from '../domain/present.js';
import { toApiData } from '../domain/criteria.js';
import { escapeRegex } from '../core/text.js';
import { ToolError } from '../core/errors.js';
import { handler, page } from './run.js';
import { proprieteFilters, expandVilles } from './searches.js';
import * as mcpApi from '../api/mcp.js';
import {
  adresseSchema,
  criteriaShape,
  criteriaSchema,
  day,
  i18nSchema,
  ref as refIn,
  refs,
  type CriteriaInput,
} from './schemas.js';
import type { Propriete } from '../types/models.js';
import type { Adresse } from '../types/api.js';

const CRITERIA_KEYS = Object.keys(criteriaShape) as (keyof CriteriaInput)[];

/** Champs éditables d'un bien (entrée métier). */
const editable = {
  transaction: refIn('ProprieteTransaction', '"Vente" ou "Location".').optional(),
  type_bien: refIn('ProprieteBien', 'Ex. "Appartement", "Maison".').optional(),
  option_bien: refIn('ProprieteBienOption', 'Dépend du type de bien (ex. Penthouse, Duplex).').nullable().optional(),
  etat: refIn('ProprieteEtat', 'Ex. "Neuf – Première main", "Rénové".').nullable().optional(),
  statut: refIn('ProprieteStatus', '"Disponible" / "Non disponible".').optional(),
  source: refIn('ContactSource').nullable().optional(),
  agent: refIn('User').optional().describe('Agent responsable (modification uniquement).'),
  proprietaire_contact_id: z.number().int().nullable().optional().describe('Contact propriétaire (catégorie proprietaire).'),
  projet_id: z.number().int().nullable().optional().describe('Projet neuf dont le bien est un lot.'),
  titre: i18nSchema.optional(),
  description: i18nSchema.optional(),
  adresse: adresseSchema.optional(),
  prix: z.number().nullable().optional().describe('Prix de vente / loyer (₪).'),
  prix_fermeture: z.number().nullable().optional().describe('Prix plancher acceptable (₪).'),
  surface: z.number().nullable().optional().describe('Surface habitable m².'),
  surface_terrain: z.number().nullable().optional(),
  surface_terrasse: z.number().nullable().optional(),
  pieces: z.number().nullable().optional(),
  etage: z.number().nullable().optional(),
  places_parking: z.number().nullable().optional(),
  num_apt: z.string().nullable().optional(),
  orientation: z.string().nullable().optional(),
  terrasse: z.boolean().optional(),
  jardin: z.boolean().optional(),
  toit: z.boolean().optional(),
  ascenseur: z.boolean().optional(),
  parking: z.boolean().optional(),
  cave: z.boolean().optional(),
  vue_mer: z.boolean().optional(),
  meuble: z.boolean().optional(),
  luxe: z.boolean().optional(),
  exclusivite: z.boolean().optional(),
  exclusivite_expire: day.nullable().optional(),
  sur_site_web: z.boolean().optional().describe('Publier sur le site MyKeyz.'),
  commentaire: z.string().nullable().optional(),
};
type EditableInput = { [K in keyof typeof editable]?: z.infer<(typeof editable)[K]> };

const DIRECT: [keyof EditableInput, keyof Propriete][] = [
  ['prix', 'prix_vente'],
  ['prix_fermeture', 'prix_fermeture'],
  ['surface', 'superficie'],
  ['surface_terrain', 'superficie_terrain'],
  ['surface_terrasse', 'terrace_superficie'],
  ['pieces', 'nb_pieces'],
  ['etage', 'etage'],
  ['places_parking', 'parking_place'],
  ['num_apt', 'num_apt'],
  ['orientation', 'orientation'],
  ['terrasse', 'terrace'],
  ['jardin', 'jardin'],
  ['toit', 'toit'],
  ['ascenseur', 'ascenseur'],
  ['parking', 'parking'],
  ['cave', 'cave'],
  ['vue_mer', 'vue_mer'],
  ['meuble', 'meuble'],
  ['luxe', 'luxe'],
  ['exclusivite', 'exclus'],
  ['exclusivite_expire', 'exclus_expire'],
  ['sur_site_web', 'website'],
  ['proprietaire_contact_id', 'contact_id'],
  ['projet_id', 'projet_id'],
];

function toPayload(a: EditableInput, current?: Partial<Propriete>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const [k, api] of DIRECT) if (a[k] !== undefined) p[api] = a[k];
  if (a.commentaire !== undefined) p.commentaire = a.commentaire;
  if (a.transaction !== undefined) p.transaction_id = ref.resolve('ProprieteTransaction', a.transaction);
  if (a.type_bien !== undefined) p.bien_id = ref.resolve('ProprieteBien', a.type_bien);
  const bien = (p.bien_id as number | undefined) ?? current?.bien_id ?? null;
  if (a.option_bien !== undefined) p.bien_option_id = ref.resolveOpt('ProprieteBienOption', a.option_bien, bien);
  else if (p.bien_id !== undefined && current?.bien_option_id != null) {
    const opt = ref.item('ProprieteBienOption', current.bien_option_id);
    if (opt && opt.bien_id !== p.bien_id) p.bien_option_id = null;
  }
  if (a.etat !== undefined) p.etat_id = ref.resolveOpt('ProprieteEtat', a.etat);
  if (a.statut !== undefined) p.status_id = ref.resolve('ProprieteStatus', a.statut);
  if (a.source !== undefined) p.source_id = ref.resolveOpt('ContactSource', a.source);
  if (a.agent !== undefined) p.user_id = ref.resolve('User', a.agent);
  if (a.titre !== undefined) p.titre = { ...(current?.titre ?? {}), ...a.titre };
  if (a.description !== undefined) p.description = { ...(current?.description ?? {}), ...a.description };
  if (a.adresse !== undefined) {
    const adr: Record<string, unknown> = { ...((current?.adresse as Adresse) ?? {}), ...a.adresse };
    if (a.adresse.quartier_id !== undefined) adr.quartier_id = ref.resolveOpt('Quartier', a.adresse.quartier_id);
    p.adresse = adr;
  }
  return p;
}

function clean(p: Record<string, unknown>): Record<string, unknown> {
  const { _id, color_id, user, ...rest } = p;
  void _id;
  void color_id;
  void user;
  return rest;
}

export function registerProprieteTools(server: McpServer): void {
  server.registerTool(
    'list_proprietes',
    {
      title: 'Rechercher des biens',
      description:
        "Recherche de biens (mandats de l'agence) avec les MÊMES critères qu'une recherche acheteur (ville, quartier, type, pièces, budget, équipements…) + référence, statut, agent. Référentiels : ids ou libellés. Par défaut : mandats propres, tous statuts.",
      inputSchema: {
        reference: z.string().optional().describe('Référence du bien (ex. "MKV-929").'),
        statut: refs('ProprieteStatus').optional().describe('Ex. "Disponible".'),
        agent: refs('User').optional(),
        inclure_annonces: z.boolean().default(false).describe('Inclure les annonces scrapées (hors mandats).'),
        ...criteriaShape,
        tri: z.enum(['modifie', 'recent', 'prix_asc', 'prix_desc']).default('modifie'),
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const c: Record<string, unknown> = {};
      for (const k of CRITERIA_KEYS) if ((a as Record<string, unknown>)[k] !== undefined) c[k] = (a as Record<string, unknown>)[k];
      const f = proprieteFilters(expandVilles(toApiData(criteriaSchema.parse(c))), {
        inclure_annonces: a.inclure_annonces,
        disponibles_seulement: false,
      });
      if (a.statut !== undefined) f.status_id = ref.resolveMany('ProprieteStatus', a.statut);
      if (a.agent !== undefined) f.user_id = ref.resolveMany('User', a.agent);
      if (a.reference) f.ref = escapeRegex(a.reference.trim());
      const sort = {
        modifie: { key: 'date_update', value: 'DESC' as const },
        recent: { key: 'id', value: 'DESC' as const },
        prix_asc: { key: 'prix_vente', value: 'ASC' as const },
        prix_desc: { key: 'prix_vente', value: 'DESC' as const },
      }[a.tri];
      const res = await proprietesApi.listV2({ filters: f, sort, limit: a.limit, page: a.page });
      return {
        ...page(res, a.limit),
        biens: res.data.map((p) => present.propriete(p as Propriete & { origine_id?: number })),
      };
    }),
  );

  server.registerTool(
    'get_propriete',
    {
      title: 'Fiche bien complète',
      description:
        "Fiche d'un bien : caractéristiques, jointures { id, label }, propriétaire, projet lié, RDV et nombre d'acheteurs potentiels actifs (détail via find_buyers). Photos/plans : list_ged.",
      inputSchema: { id: z.number().int().describe('Id du bien.') },
      annotations: { readOnlyHint: true },
    },
    handler(async ({ id }) => {
      const [d, buyers] = await Promise.all([
        proprietesApi.get(id),
        mcpApi.buyers(id, true).catch(() => null),
      ]);
      return {
        bien: present.proprieteDetail(d.propriete),
        proprietaire: d.contact
          ? {
              id: d.contact.id,
              nom: present.fullName(d.contact),
              telephone: d.contact.telephone || d.contact.mobile || null,
            }
          : d.propriete.contact_id
            ? { id: d.propriete.contact_id, nom: null, note: 'hors périmètre de l’utilisateur' }
            : null,
        projet: d.projet ? present.projet(d.projet) : null,
        acheteurs_potentiels_actifs: Array.isArray(buyers) ? buyers.length : null,
        rdv: (d.agenda ?? []).map(present.event),
      };
    }),
  );

  server.registerTool(
    'create_propriete',
    {
      title: 'Créer un bien',
      description:
        "Crée un bien (mandat). Requis : transaction, type_bien. Statut « Disponible » par défaut, agent = utilisateur connecté. La référence (ex. MKV-123) et le quartier (si lat/lng) sont calculés par l'API. ACL 17.",
      inputSchema: {
        ...editable,
        transaction: refIn('ProprieteTransaction', '"Vente" ou "Location".'),
        type_bien: refIn('ProprieteBien'),
      },
    },
    handler(async (a) => {
      const { agent, ...rest } = a;
      if (agent !== undefined) throw new ToolError("À la création, l'agent est l'utilisateur connecté : réassigne ensuite via update_propriete.");
      const payload = toPayload({ ...rest, statut: rest.statut ?? 'disponible' });
      const saved = await proprietesApi.create(payload as Partial<Propriete>);
      return { ok: true, bien: present.proprieteDetail(saved) };
    }),
  );

  server.registerTool(
    'update_propriete',
    {
      title: 'Modifier un bien',
      description:
        "Modifie un bien : seuls les champs fournis changent (fusion avec la fiche, adresse et textes multilingues fusionnés champ à champ). ACL 18 (statut 19).",
      inputSchema: { id: z.number().int(), ...editable },
    },
    handler(async ({ id, ...a }) => {
      if (!Object.values(a).some((v) => v !== undefined)) throw new ToolError('Aucun champ à modifier.');
      const current = (await proprietesApi.get(id)).propriete;
      const payload = { ...clean(current as unknown as Record<string, unknown>), ...toPayload(a, current), id };
      const saved = await proprietesApi.create(payload as Partial<Propriete> & { id: number });
      return { ok: true, bien: present.proprieteDetail(saved) };
    }),
  );
}
