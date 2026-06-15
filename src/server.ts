import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContactTools } from './tools/contacts.js';
import { registerProprieteTools } from './tools/proprietes.js';
import { registerAgendaTools } from './tools/agenda.js';
import { registerProjetTools } from './tools/projets.js';
import { registerTransactionTools } from './tools/transactions.js';
import { registerGedTools } from './tools/ged.js';
import { registerAiTools } from './tools/ai.js';
import { registerReferentialTools } from './tools/referentials.js';

/**
 * Construit un serveur MCP configuré avec tous les outils MyKeyz.
 * Utilisé par les deux transports (stdio et HTTP).
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'mykeyz-mcp', version: '0.1.0' });
  registerReferentialTools(server);
  registerContactTools(server);
  registerProprieteTools(server);
  registerAgendaTools(server);
  registerProjetTools(server);
  registerTransactionTools(server);
  registerGedTools(server);
  registerAiTools(server);
  return server;
}
