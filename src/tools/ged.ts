import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as gedApi from '../api/ged.js';
import * as ref from '../core/referentials.js';
import { handler } from './run.js';
import { ref as refIn, refs } from './schemas.js';
import type { Ged } from '../types/models.js';

const entity = z.enum(['Propriete', 'Projet']).describe('Type de fiche : bien ou projet.');

function present(g: Ged) {
  return {
    id: g.id,
    titre: g.titre ?? null,
    type: ref.pair('GedType', g.type_id),
    url: g.link || g.url || null,
    rattachement: g.model && g.model_id ? { type: g.model, id: g.model_id } : null,
  };
}

export function registerGedTools(server: McpServer): void {
  server.registerTool(
    'list_ged',
    {
      title: 'Documents d’un bien / projet',
      description: 'Fichiers (photos, plans, brochures…) rattachés à un bien ou un projet, filtrables par type.',
      inputSchema: {
        type: entity,
        id: z.number().int(),
        type_document: refs('GedType', 'Ex. "Image", "Plan", "Brochure".').optional(),
      },
      annotations: { readOnlyHint: true },
    },
    handler(async (a) => {
      const res = await gedApi.list(a.type, a.id);
      let files = Array.isArray(res) ? res : [];
      if (a.type_document !== undefined) {
        const ids = ref.resolveMany('GedType', a.type_document);
        files = files.filter((f) => ids.includes(f.type_id));
      }
      return { count: files.length, documents: files.map(present) };
    }),
  );

  server.registerTool(
    'ged_upload',
    {
      title: 'Ajouter un document',
      description: 'Ajoute un fichier (base64) à un bien ou un projet. ACL 21.',
      inputSchema: {
        file: z.string().describe('Contenu base64 (data URL acceptée).'),
        file_name: z.string().describe('Nom du fichier avec extension.'),
        type: entity,
        id: z.number().int(),
        type_document: refIn('GedType').default('image'),
      },
    },
    handler(async (a) => {
      const res = await gedApi.upload(a.file, a.file_name, {
        model: a.type,
        model_id: a.id,
        type_id: ref.resolve('GedType', a.type_document) as number,
      });
      return { ok: true, document: typeof res === 'object' && res ? present(res as Ged) : res };
    }),
  );

  server.registerTool(
    'ged_delete',
    {
      title: 'Supprimer un document',
      description: '⚠️ Supprime définitivement un document (irréversible). Confirme avec l’utilisateur avant. ACL 21.',
      inputSchema: { id: z.number().int() },
      annotations: { destructiveHint: true },
    },
    handler(async ({ id }) => {
      await gedApi.remove(id);
      return { ok: true, supprime: id };
    }),
  );
}
