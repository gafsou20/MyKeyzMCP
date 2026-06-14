import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerContactTools } from './tools/contacts.js';

/**
 * Construit un serveur MCP configuré avec tous les outils MyKeyz.
 * Utilisé par les deux transports (stdio et HTTP).
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'mykeyz-mcp', version: '0.1.0' });
  registerContactTools(server);
  return server;
}
