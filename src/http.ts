#!/usr/bin/env node
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runWithToken } from './core/context.js';

// Port/host. Derrière Plesk Passenger, PORT peut être un chemin de socket Unix
// (donc on ne force PAS Number). En pm2 + reverse-proxy, on fixe PORT + HOST.
const PORT: string | number = process.env.PORT ?? 8787;
const HOST = process.env.HOST; // ex. 127.0.0.1 (bind local derrière proxy)

/**
 * Extrait le token MyKeyz du header Authorization (tolère le préfixe Bearer).
 * Aucun repli serveur : sans header, la requête est refusée (multi-locataire).
 */
function tokenFromRequest(req: express.Request): string | null {
  const raw = req.headers['authorization'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value.replace(/^Bearer\s+/i, '').trim() || null;
}

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'mykeyz-mcp' });
});

/**
 * Endpoint MCP en mode **stateless** : un serveur + transport éphémères par
 * requête, exécutés dans le contexte du token de l'appelant. Pas d'état partagé
 * entre utilisateurs → sûr en multi-locataire.
 */
app.post('/mcp', async (req, res) => {
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'token MyKeyz manquant (header Authorization).' },
      id: null,
    });
    return;
  }

  await runWithToken(token, async () => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
});

// En stateless, GET/DELETE (flux SSE long, sessions) ne sont pas utilisés.
const methodNotAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
app.get('/mcp', methodNotAllowed);
app.delete('/mcp', methodNotAllowed);

const ready = () => console.error(`[mykeyz-mcp] HTTP prêt sur ${HOST ?? '*'}:${PORT} (POST /mcp).`);
if (HOST) {
  app.listen(Number(PORT), HOST, ready);
} else {
  // PORT peut être numérique ou un socket (Passenger) → on le passe tel quel.
  app.listen(PORT as number, ready);
}
