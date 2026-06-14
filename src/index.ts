#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MYKEYZ_TOKEN } from './core/config.js';
import * as ref from './core/referentials.js';
import { registerContactTools } from './tools/contacts.js';

async function main() {
  if (!MYKEYZ_TOKEN) {
    console.error('[mykeyz-mcp] MYKEYZ_TOKEN manquant — renseigner le .env.');
    process.exit(1);
  }

  // Charge le dictionnaire de référentiels (id→libellé) une fois au démarrage.
  // Non bloquant : si l'API est injoignable, les outils renverront les ids bruts.
  try {
    await ref.load();
  } catch (e) {
    console.error('[mykeyz-mcp] Référentiels non chargés:', (e as Error).message);
  }

  const server = new McpServer({ name: 'mykeyz-mcp', version: '0.1.0' });

  registerContactTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mykeyz-mcp] prêt (stdio).');
}

main().catch((e) => {
  console.error('[mykeyz-mcp] erreur fatale:', e);
  process.exit(1);
});
