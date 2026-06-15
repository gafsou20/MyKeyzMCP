import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as aiApi from '../api/ai.js';
import { structured } from './respond.js';
import { genericResult } from './outputs.js';

export function registerAiTools(server: McpServer): void {
  server.registerTool(
    'generate_seo',
    {
      description:
        "Génère (via l'IA de l'API) le contenu SEO multilingue d'un bien ou d'un projet, puis le sauvegarde sur la fiche. ACL 22.",
      inputSchema: {
        type: z.enum(['propriete', 'projet']).describe("Type d'entité."),
        id: z.number().int().describe("Identifiant de l'entité."),
      },
      outputSchema: genericResult,
    },
    async ({ type, id }) => {
      const res = type === 'propriete' ? await aiApi.propriete(id) : await aiApi.projet(id);
      return structured({ ok: true, result: res });
    },
  );
}
