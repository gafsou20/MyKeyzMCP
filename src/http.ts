#!/usr/bin/env node
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { runWithToken } from './core/context.js';
import { oauthRouter, resolveBearer, baseUrl } from './auth/oauth.js';
import { OAUTH_ENABLED } from './auth/crypto.js';

// Port/host. Derrière Plesk Passenger, PORT peut être un chemin de socket Unix
// (donc on ne force PAS Number). En pm2 + reverse-proxy, on fixe PORT + HOST.
const PORT: string | number = process.env.PORT ?? 8787;
const HOST = process.env.HOST; // ex. 127.0.0.1 (bind local derrière proxy)

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Couche OAuth (découverte, enregistrement, authorize, token).
app.use(oauthRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: 'mykeyz-mcp', oauth: OAUTH_ENABLED });
});

/**
 * Endpoint MCP en mode **stateless** : un serveur + transport éphémères par
 * requête, exécutés dans le contexte du token de l'appelant (OAuth ou PAT brut).
 */
app.post('/mcp', async (req, res) => {
  const token = await resolveBearer(req.headers['authorization'] as string | undefined);
  if (!token) {
    res
      .status(401)
      .set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${baseUrl(req)}/.well-known/oauth-protected-resource"`,
      )
      .json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'authentification requise (token MyKeyz ou OAuth).' },
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

const ready = () =>
  console.error(
    `[mykeyz-mcp] HTTP prêt sur ${HOST ?? '*'}:${PORT} (POST /mcp) — OAuth: ${OAUTH_ENABLED ? 'on' : 'off'}.`,
  );
if (HOST) {
  app.listen(Number(PORT), HOST, ready);
} else {
  // PORT peut être numérique ou un socket (Passenger) → on le passe tel quel.
  app.listen(PORT as number, ready);
}
