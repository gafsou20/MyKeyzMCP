import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ref from '../core/referentials.js';

const DESCRIPTION = [
  "Dictionnaire des référentiels MyKeyz (équivaut à /param/all). ESSENTIEL :",
  "l'API ne stocke que des **identifiants** (status_id, categorie_id, source_id,",
  'langue_id, user_id, transaction_id, bien_id, etat_id, AgendaCategorie…) et NE',
  'fait PAS les jointures. Avant de créer/modifier une fiche, ou pour interpréter',
  'un id, résous-le ICI : appelle sans `model` pour lister les référentiels',
  'disponibles, puis avec `model` pour obtenir les couples id ↔ libellé.',
].join(' ');

export function registerReferentialTools(server: McpServer): void {
  server.tool(
    'list_referentials',
    DESCRIPTION,
    {
      model: z
        .string()
        .optional()
        .describe('Nom du référentiel (ex. "ContactStatus"). Omis = liste les référentiels existants.'),
    },
    async ({ model }) => {
      await ref.ensureLoaded();
      if (!model) {
        const payload = {
          note: "Appelle à nouveau avec un `model` pour obtenir les id ↔ libellés.",
          available_models: ref.modelNames(),
        };
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }
      const items = ref.entries(model);
      if (!items.length) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { model, items: [], hint: 'Référentiel inconnu — vérifie le nom via un appel sans `model`.', available_models: ref.modelNames() },
                null,
                2,
              ),
            },
          ],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ model, count: items.length, items }, null, 2) }] };
    },
  );
}
