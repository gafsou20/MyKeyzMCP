import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as gedApi from '../api/ged.js';
import { structured } from './respond.js';
import { gedList, genericResult } from './outputs.js';

export function registerGedTools(server: McpServer): void {
  server.registerTool(
    'list_ged',
    {
      description:
        "Liste les fichiers (GED) rattachés à une entité. `model` = nom de l'entité ('Contact' | 'Propriete' | 'Projet'), `model_id` = son id.",
      inputSchema: {
        model: z.string().describe('Type d\'entité, ex. "Propriete" ou "Contact".'),
        model_id: z.number().int().describe("Identifiant de l'entité."),
      },
      outputSchema: gedList,
      annotations: { readOnlyHint: true },
    },
    async ({ model, model_id }) => {
      const res = await gedApi.list(model, model_id);
      return structured({ files: Array.isArray(res) ? res : [] });
    },
  );

  server.registerTool(
    'ged_upload',
    {
      description:
        "Uploade un fichier (image/document) encodé en base64 et le rattache à une entité. ACL 21.",
      inputSchema: {
        file: z.string().describe('Contenu du fichier encodé en base64 (data URL acceptée).'),
        file_name: z.string().describe('Nom du fichier (avec extension).'),
        model: z.string().optional().describe('Type d\'entité à rattacher (ex. "Propriete").'),
        model_id: z.number().int().optional().describe("Id de l'entité à rattacher."),
        type_id: z.number().int().optional().describe('Type de document (référentiel GED).'),
      },
      outputSchema: genericResult,
    },
    async ({ file, file_name, model, model_id, type_id }) => {
      const ged =
        model && model_id ? { model, model_id, ...(type_id ? { type_id } : {}) } : undefined;
      const res = await gedApi.upload(file, file_name, ged);
      return structured({ ok: true, result: res });
    },
  );

  server.registerTool(
    'ged_delete',
    {
      description: '⚠️ Supprime définitivement un fichier de la GED (irréversible). ACL 21.',
      inputSchema: { id: z.number().int().describe('Identifiant du fichier GED.') },
      outputSchema: genericResult,
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const res = await gedApi.remove(id);
      return structured({ ok: true, message: typeof res === 'string' ? res : 'deleted', result: res });
    },
  );
}
