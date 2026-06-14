#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { STDIO_TOKEN } from './core/config.js';
import { setDefaultToken } from './core/context.js';
import { createServer } from './server.js';

/**
 * Entrée **stdio** (Claude Desktop, mono-poste). Le token est fourni par la
 * config du client qui lance ce process (variable d'env MYKEYZ_TOKEN). Ce n'est
 * PAS le mode multi-utilisateur — pour ça, voir l'entrée HTTP (`http.ts`).
 */
async function main() {
  if (!STDIO_TOKEN) {
    console.error('[mykeyz-mcp] stdio : MYKEYZ_TOKEN absent (à passer par la config du client).');
    process.exit(1);
  }
  setDefaultToken(STDIO_TOKEN);

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mykeyz-mcp] prêt (stdio).');
}

main().catch((e) => {
  console.error('[mykeyz-mcp] erreur fatale:', e);
  process.exit(1);
});
