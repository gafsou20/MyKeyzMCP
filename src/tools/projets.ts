import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as projetsApi from '../api/projets.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { addressLine } from '../core/format.js';
import type { Projet } from '../types/models.js';

function présenter(p: Projet) {
  return {
    id: p.id,
    ref: p.ref,
    nom: p.nom || p.ref || `#${p.id}`,
    promoteur: p.promoteur,
    statut: ref.label('ProjetStatus', p.status_id) || p.status_id,
    prix_min: p.prix_min,
    prix_max: p.prix_max,
    date_livraison: p.date_livraison,
    adresse: addressLine(p.adresse),
    agent: ref.label('User', p.user_id) || p.user_id,
  };
}

export function registerProjetTools(server: McpServer): void {
  server.tool(
    'list_projets',
    'Liste les projets immobiliers (programmes neufs) du CRM MyKeyz.',
    {
      nom: z.string().optional().describe('Recherche par nom de projet.'),
      limit: z.number().int().min(1).max(100).default(25),
      page: z.number().int().min(1).default(1),
    },
    async ({ nom, limit, page }) => {
      await ref.ensureLoaded();
      const filters: Record<string, unknown> = {};
      if (nom) filters.nom = nom;
      const res = await projetsApi.list(defaultListQuery({ filters, limit, page }));
      const payload = {
        total: res.totalRow,
        page: res.currentPage,
        count: res.data.length,
        projets: res.data.map(présenter),
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.tool(
    'get_projet',
    "Fiche détaillée d'un projet : infos, promoteur, lots (biens) liés et contact.",
    {
      id: z.number().int().describe('Identifiant du projet.'),
    },
    async ({ id }) => {
      await ref.ensureLoaded();
      const d = await projetsApi.get(id);
      const payload = {
        ...présenter(d.projet),
        constructeur: d.projet.constructeur,
        contact: d.contact
          ? [d.contact.prenom, d.contact.nom, d.contact.socite].filter(Boolean).join(' ').trim()
          : null,
        lots_lies: d.proprietes?.length ?? 0,
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );
}
