#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MYKEYZ_TOKEN } from './core/config.js';
import { createServer } from './server.js';

/**
 * Entrée stdio (Claude Desktop, mono-utilisateur).
 * Le token vient du `.env` (MYKEYZ_TOKEN) via le repli de `core/context`.
 */
async function main() {
  if (!MYKEYZ_TOKEN) {
    console.error('[mykeyz-mcp] MYKEYZ_TOKEN manquant — renseigner le .env (mode stdio).');
    process.exit(1);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mykeyz-mcp] prêt (stdio).');
}

main().catch((e) => {
  console.error('[mykeyz-mcp] erreur fatale:', e);
  process.exit(1);
});
