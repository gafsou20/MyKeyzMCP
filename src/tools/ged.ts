import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as gedApi from '../api/ged.js';

export function registerGedTools(server: McpServer): void {
  server.tool(
    'list_ged',
    "Liste les fichiers (GED) rattachés à une entité (Contact, Propriete, Projet).",
    {
      model: z.string().describe('Type d\'entité, ex. "Propriete" ou "Contact".'),
      model_id: z.number().int().describe('Identifiant de l\'entité.'),
    },
    async ({ model, model_id }) => {
      const res = await gedApi.list(model, model_id);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    'ged_upload',
    "Uploade un fichier (image/document) encodé en base64 et le rattache à une entité. ACL 21.",
    {
      file: z.string().describe('Contenu du fichier encodé en base64 (data URL acceptée).'),
      file_name: z.string().describe('Nom du fichier (avec extension).'),
      model: z.string().optional().describe('Type d\'entité à rattacher (ex. "Propriete").'),
      model_id: z.number().int().optional().describe('Id de l\'entité à rattacher.'),
      type_id: z.number().int().optional().describe('Type de document (référentiel GED).'),
    },
    async ({ file, file_name, model, model_id, type_id }) => {
      const ged =
        model && model_id ? { model, model_id, ...(type_id ? { type_id } : {}) } : undefined;
      const res = await gedApi.upload(file, file_name, ged);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    'ged_delete',
    '⚠️ Supprime définitivement un fichier de la GED (irréversible). ACL 21.',
    {
      id: z.number().int().describe('Identifiant du fichier GED.'),
    },
    async ({ id }) => {
      const res = await gedApi.remove(id);
      return { content: [{ type: 'text', text: typeof res === 'string' ? res : JSON.stringify(res) }] };
    },
  );
}
