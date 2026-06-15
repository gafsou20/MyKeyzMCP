import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as aiApi from '../api/ai.js';

export function registerAiTools(server: McpServer): void {
  server.tool(
    'generate_seo',
    "Génère (via l'IA de l'API) le contenu SEO multilingue d'un bien ou d'un projet, puis le **sauvegarde** sur la fiche. ACL 22.",
    {
      type: z.enum(['propriete', 'projet']).describe('Type d\'entité.'),
      id: z.number().int().describe('Identifiant de l\'entité.'),
    },
    async ({ type, id }) => {
      const res = type === 'propriete' ? await aiApi.propriete(id) : await aiApi.projet(id);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    },
  );
}
