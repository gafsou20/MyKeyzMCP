import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as ref from '../core/referentials.js';
import { structured } from './respond.js';
import { referentialOut } from './outputs.js';

const DESCRIPTION = [
  "Dictionnaire des référentiels MyKeyz (équivaut à /param/all). ESSENTIEL :",
  "l'API ne stocke que des **identifiants** (status_id, categorie_id, source_id,",
  'langue_id, user_id, transaction_id, bien_id, etat_id, AgendaCategorie…) et NE',
  'fait PAS les jointures. Avant de créer/modifier une fiche, ou pour interpréter',
  'un id, résous-le ICI : appelle sans `model` pour lister les référentiels',
  'disponibles, puis avec `model` pour obtenir les couples id ↔ libellé.',
].join(' ');

export function registerReferentialTools(server: McpServer): void {
  server.registerTool(
    'list_referentials',
    {
      description: DESCRIPTION,
      inputSchema: {
        model: z
          .string()
          .optional()
          .describe('Nom du référentiel (ex. "ContactStatus"). Omis = liste les référentiels existants.'),
      },
      outputSchema: referentialOut,
      annotations: { readOnlyHint: true },
    },
    async ({ model }) => {
      await ref.ensureLoaded();
      if (!model) {
        return structured({
          note: 'Appelle à nouveau avec un `model` pour obtenir les id ↔ libellés.',
          available_models: ref.modelNames(),
        });
      }
      const items = ref.entries(model);
      if (!items.length) {
        return structured({
          model,
          items: [],
          hint: 'Référentiel inconnu — vérifie le nom via un appel sans `model`.',
          available_models: ref.modelNames(),
        });
      }
      return structured({ model, count: items.length, items });
    },
  );
}
