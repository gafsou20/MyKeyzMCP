import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as projetsApi from '../api/projets.js';
import { defaultListQuery } from '../types/api.js';
import * as ref from '../core/referentials.js';
import { addressLine } from '../core/format.js';
import { adresseSchema } from './schemas.js';
import type { Projet, Contact } from '../types/models.js';

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

  // ── Écriture ────────────────────────────────────────────────────────────────

  server.tool(
    'create_projet',
    "Crée un projet (programme neuf), ou le met à jour via `id`. Soumis à l'ACL (ajout 17). Un promoteur (contact) peut être rattaché.",
    {
      id: z.number().int().optional().describe('Présent = mise à jour.'),
      nom: z.string().optional(),
      promoteur: z.string().nullable().optional(),
      constructeur: z.string().nullable().optional(),
      status_id: z.number().int().optional().describe('Référentiel ProjetStatus.'),
      type_id: z.number().int().nullable().optional(),
      date_livraison: z.string().nullable().optional().describe('Date YYYY-MM-DD.'),
      prix_min: z.number().nullable().optional(),
      prix_max: z.number().nullable().optional(),
      adresse: adresseSchema.optional(),
      contact_id: z.number().int().optional().describe('Promoteur existant à rattacher.'),
    },
    async ({ contact_id, ...projet }) => {
      await ref.ensureLoaded();
      const contact: Partial<Contact> = contact_id ? { id: contact_id } : {};
      const saved = await projetsApi.create(projet as Partial<Projet>, contact);
      return { content: [{ type: 'text', text: JSON.stringify(présenter(saved.projet), null, 2) }] };
    },
  );
}
