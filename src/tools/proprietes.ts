import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as proprietesApi from '../api/proprietes.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { i18nText, addressLine } from '../core/format.js';
import type { Propriete } from '../types/models.js';

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
  server.tool(
    'list_proprietes',
    "Liste les biens immobiliers (mandats) du CRM MyKeyz. Filtres simples + recherche par référence.",
    {
      ref: z.string().optional().describe('Recherche par référence du bien.'),
      transaction_id: z.number().int().optional().describe('Type de transaction (référentiel ProprieteTransaction).'),
      bien_id: z.number().int().optional().describe('Type de bien (référentiel ProprieteBien).'),
      limit: z.number().int().min(1).max(100).default(25),
      page: z.number().int().min(1).default(1),
    },
    async ({ ref: refSearch, transaction_id, bien_id, limit, page }) => {
      await ref.ensureLoaded();
      const filters: Record<string, unknown> = {};
      if (refSearch) filters.ref = refSearch;
      if (transaction_id !== undefined) filters.transaction_id = transaction_id;
      if (bien_id !== undefined) filters.bien_id = bien_id;

      const res = await proprietesApi.list(defaultListQuery({ filters, limit, page }));
      const payload = {
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        proprietes: res.data.map(présenter),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'get_propriete',
    "Fiche détaillée d'un bien : caractéristiques, adresse, propriétaire, projet lié et acheteurs potentiels (matching).",
    {
      id: z.number().int().describe('Identifiant du bien.'),
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const d = await proprietesApi.get(id);
      const p = d.propriete;
      const payload = {
        ...présenter(p),
        description: i18nText(p.description),
        proprietaire: d.contact
          ? [d.contact.prenom, d.contact.nom, d.contact.socite].filter(Boolean).join(' ').trim()
          : null,
        projet_lie: d.projet ? d.projet.nom || d.projet.ref : null,
        acheteurs_potentiels: d.searchs?.length ?? 0,
        rdv: (d.agenda ?? []).map((e) => ({ titre: e.data?.titre, date: e.data?.date, heure: e.data?.heure })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
