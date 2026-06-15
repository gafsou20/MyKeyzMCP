import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as proprietesApi from '../api/proprietes.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { i18nText, addressLine } from '../core/format.js';
import { i18nSchema, adresseSchema } from './schemas.js';
import { structured } from './respond.js';
import { proprieteItem, proprieteList, proprieteDetail } from './outputs.js';
import type { Propriete } from '../types/models.js';

/** Champs modifiables d'un bien (tous optionnels). */
const proprieteFields = {
  ref: z.string().nullable().optional(),
  contact_id: z.number().int().nullable().optional().describe('Propriétaire (contact).'),
  projet_id: z.number().int().nullable().optional(),
  transaction_id: z.number().int().nullable().optional().describe('Référentiel ProprieteTransaction.'),
  bien_id: z.number().int().nullable().optional().describe('Type de bien (référentiel ProprieteBien).'),
  bien_option_id: z.number().int().nullable().optional(),
  etat_id: z.number().int().nullable().optional(),
  source_id: z.number().int().nullable().optional(),
  status_id: z.number().int().optional().describe('Référentiel ProprieteStatus.'),
  titre: i18nSchema.optional(),
  description: i18nSchema.optional(),
  adresse: adresseSchema.optional(),
  superficie: z.number().nullable().optional(),
  superficie_terrain: z.number().nullable().optional(),
  etage: z.number().nullable().optional(),
  nb_pieces: z.number().nullable().optional(),
  orientation: z.string().nullable().optional(),
  num_apt: z.string().nullable().optional(),
  prix_vente: z.number().nullable().optional(),
  terrace: z.boolean().optional(),
  jardin: z.boolean().optional(),
  ascenseur: z.boolean().optional(),
  parking: z.boolean().optional(),
  cave: z.boolean().optional(),
  vue_mer: z.boolean().optional(),
  meuble: z.boolean().optional(),
  luxe: z.boolean().optional(),
  exclus: z.boolean().optional(),
  exclus_expire: z.string().nullable().optional(),
};

function présenter(p: Propriete) {
  return {
    id: p.id,
    ref: p.ref,
    titre: i18nText(p.titre) || ref.label('ProprieteBien', p.bien_id) || `#${p.id}`,
    transaction: ref.label('ProprieteTransaction', p.transaction_id) || null,
    type_bien: ref.label('ProprieteBien', p.bien_id) || null,
    statut: ref.label('ProprieteStatus', p.status_id) || p.status_id,
    etat: ref.label('ProprieteEtat', p.etat_id) || null,
    prix: p.prix_vente,
    superficie: p.superficie,
    nb_pieces: p.nb_pieces,
    etage: p.etage,
    adresse: addressLine(p.adresse),
    agent: ref.label('User', p.user_id) || p.user_id,
  };
}

export function registerProprieteTools(server: McpServer): void {
  server.registerTool(
    'list_proprietes',
    {
      description:
        "Liste les biens immobiliers (mandats) du CRM MyKeyz. Filtres simples + recherche par référence.",
      inputSchema: {
        ref: z.string().optional().describe('Recherche par référence du bien.'),
        transaction_id: z.number().int().optional().describe('Type de transaction (référentiel ProprieteTransaction).'),
        bien_id: z.number().int().optional().describe('Type de bien (référentiel ProprieteBien).'),
        limit: z.number().int().min(1).max(100).default(25),
        page: z.number().int().min(1).default(1),
      },
      outputSchema: proprieteList,
      annotations: { readOnlyHint: true },
    },
    async ({ ref: refSearch, transaction_id, bien_id, limit, page }) => {
      await ref.ensureLoaded();
      const filters: Record<string, unknown> = {};
      if (refSearch) filters.ref = refSearch;
      if (transaction_id !== undefined) filters.transaction_id = transaction_id;
      if (bien_id !== undefined) filters.bien_id = bien_id;
      const res = await proprietesApi.list(defaultListQuery({ filters, limit, page }));
      return structured({
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        proprietes: res.data.map(présenter),
      });
    },
  );

  server.registerTool(
    'get_propriete',
    {
      description:
        "Fiche détaillée d'un bien : caractéristiques, adresse, propriétaire, projet lié et acheteurs potentiels (matching).",
      inputSchema: { id: z.number().int().describe('Identifiant du bien.') },
      outputSchema: proprieteDetail,
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const d = await proprietesApi.get(id);
      const p = d.propriete;
      return structured({
        ...présenter(p),
        description: i18nText(p.description),
        proprietaire: d.contact
          ? [d.contact.prenom, d.contact.nom, d.contact.socite].filter(Boolean).join(' ').trim()
          : null,
        projet_lie: d.projet ? d.projet.nom || d.projet.ref : null,
        acheteurs_potentiels: d.searchs?.length ?? 0,
        rdv: (d.agenda ?? []).map((e) => ({ titre: e.data?.titre, date: e.data?.date, heure: e.data?.heure })),
      });
    },
  );

  // ── Écritures ──────────────────────────────────────────────────────────────

  server.registerTool(
    'create_propriete',
    {
      description:
        "Crée un bien, ou le met à jour si `id` est fourni. ACL : ajout 17 / modification 18. Champs i18n (titre/description) au format {fr,he,en}.",
      inputSchema: {
        id: z.number().int().optional().describe('Présent = mise à jour ; absent = création.'),
        ...proprieteFields,
      },
      outputSchema: proprieteItem,
    },
    async (args) => {
      await ref.ensureLoaded();
      const saved = await proprietesApi.create(args as Partial<Propriete> & { id?: number });
      return structured(présenter(saved));
    },
  );

  server.registerTool(
    'set_propriete_status',
    {
      description: "Change le statut d'un bien (ACL 19).",
      inputSchema: {
        id: z.number().int().describe('Identifiant du bien.'),
        status_id: z.number().int().describe('Nouveau statut (référentiel ProprieteStatus).'),
      },
      outputSchema: proprieteItem,
    },
    async ({ id, status_id }) => {
      await ref.ensureLoaded();
      const saved = await proprietesApi.create({ id, status_id });
      return structured(présenter(saved));
    },
  );
}
