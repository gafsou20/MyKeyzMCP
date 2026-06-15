import { createHash } from 'node:crypto';
import express from 'express';
import * as authApi from '../api/auth.js';
import { seal, unseal } from './crypto.js';
import { PUBLIC_URL } from '../core/config.js';

const ACCESS_TTL = '8h';
const REFRESH_TTL = '30d';
const CODE_TTL = '120s';
const ACCESS_TTL_SECONDS = 8 * 3600;

/** URL publique : PUBLIC_URL si défini, sinon déduite des en-têtes (proxy Plesk). */
function baseUrl(req: express.Request): string {
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

/** Vérifie le challenge PKCE (S256). */
function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = createHash('sha256').update(verifier).digest('base64url');
  return computed === challenge;
}

interface AuthzParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state?: string;
  scope?: string;
}

/** Page de login (email + mot de passe MyKeyz) avec champs OAuth en hidden. */
function loginPage(p: AuthzParams, error?: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion MyKeyz</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0e1722;color:#e7eef5;display:flex;
    min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#15212e;padding:28px;border-radius:16px;width:320px;box-shadow:0 10px 40px #0006}
  h1{font-size:18px;margin:0 0 4px}.sub{color:#8aa0b2;font-size:13px;margin:0 0 18px}
  label{display:block;font-size:12px;color:#8aa0b2;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #2a3a4a;
    background:#0e1722;color:#e7eef5;font-size:15px}
  button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:#2E5A78;
    color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  .err{background:#3a1620;color:#f8b4c0;padding:9px 11px;border-radius:9px;font-size:13px;margin-bottom:12px}
</style></head><body>
<form class="card" method="post" action="/authorize">
  <h1>Connexion MyKeyz</h1>
  <p class="sub">Autorise l'accès à ton CRM.</p>
  ${error ? `<div class="err">${esc(error)}</div>` : ''}
  <label>Email</label><input name="email" type="email" autocomplete="username" required autofocus>
  <label>Mot de passe</label><input name="password" type="password" autocomplete="current-password" required>
  <input type="hidden" name="client_id" value="${esc(p.client_id)}">
  <input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri)}">
  <input type="hidden" name="code_challenge" value="${esc(p.code_challenge)}">
  <input type="hidden" name="state" value="${esc(p.state)}">
  <input type="hidden" name="scope" value="${esc(p.scope)}">
  <button type="submit">Se connecter</button>
</form></body></html>`;
}

export const oauthRouter = express.Router();

// ── Découverte (RFC 8414 + 9728) ──────────────────────────────────────────────
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
  const b = baseUrl(req);
  res.json({
    issuer: b,
    authorization_endpoint: `${b}/authorize`,
    token_endpoint: `${b}/token`,
    registration_endpoint: `${b}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  });
});

oauthRouter.get(
  ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
  (req, res) => {
    const b = baseUrl(req);
    res.json({ resource: `${b}/mcp`, authorization_servers: [b] });
  },
);

// ── Enregistrement dynamique de client (RFC 7591), sans état ──────────────────
oauthRouter.post('/register', async (req, res) => {
  const meta = (req.body ?? {}) as Record<string, unknown>;
  const redirect_uris = Array.isArray(meta.redirect_uris) ? (meta.redirect_uris as string[]) : [];
  // client_id = jeton chiffré encodant les redirect_uris autorisées (stateless).
  const client_id = await seal({ t: 'client', redirect_uris }, '365d');
  res.status(201).json({
    ...meta,
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  });
});

// ── Authorize : affiche le login ──────────────────────────────────────────────
oauthRouter.get('/authorize', async (req, res) => {
  const q = req.query as Record<string, string>;
  if (q.response_type !== 'code') return res.status(400).send('unsupported response_type (code requis)');
  if (q.code_challenge_method !== 'S256' || !q.code_challenge)
    return res.status(400).send('PKCE S256 requis');

  const client = await unseal<{ t: string; redirect_uris: string[] }>(q.client_id).catch(() => null);
  if (!client || client.t !== 'client') return res.status(400).send('client_id invalide');
  if (client.redirect_uris.length && !client.redirect_uris.includes(q.redirect_uri))
    return res.status(400).send('redirect_uri non autorisée');

  res.set('Content-Type', 'text/html; charset=utf-8').send(
    loginPage({
      client_id: q.client_id,
      redirect_uri: q.redirect_uri,
      code_challenge: q.code_challenge,
      state: q.state,
      scope: q.scope,
    }),
  );
});

// ── Authorize POST : valide les identifiants chez MyKeyz, émet le code ────────
oauthRouter.post('/authorize', async (req, res) => {
  const b = req.body as Record<string, string>;
  const params: AuthzParams = {
    client_id: b.client_id,
    redirect_uri: b.redirect_uri,
    code_challenge: b.code_challenge,
    state: b.state,
    scope: b.scope,
  };
  try {
    const user = await authApi.login(b.email, b.password);
    if (!user?.token) throw new Error('no_token');
    const code = await seal(
      {
        t: 'code',
        mkz: user.token,
        code_challenge: params.code_challenge,
        redirect_uri: params.redirect_uri,
        client_id: params.client_id,
      },
      CODE_TTL,
    );
    const url = new URL(params.redirect_uri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    res.redirect(url.toString());
  } catch {
    res
      .status(401)
      .set('Content-Type', 'text/html; charset=utf-8')
      .send(loginPage(params, 'Identifiants invalides.'));
  }
});

// ── Token : échange code↔access (PKCE) + refresh ──────────────────────────────
oauthRouter.post('/token', async (req, res) => {
  const b = req.body as Record<string, string>;

  if (b.grant_type === 'authorization_code') {
    const payload = await unseal<{
      t: string;
      mkz: string;
      code_challenge: string;
      redirect_uri: string;
    }>(b.code).catch(() => null);
    if (!payload || payload.t !== 'code') return res.status(400).json({ error: 'invalid_grant' });
    if (!b.code_verifier || !pkceMatches(b.code_verifier, payload.code_challenge))
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE mismatch' });
    if (b.redirect_uri && payload.redirect_uri && b.redirect_uri !== payload.redirect_uri)
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri' });

    const access_token = await seal({ t: 'access', mkz: payload.mkz }, ACCESS_TTL);
    const refresh_token = await seal({ t: 'refresh', mkz: payload.mkz }, REFRESH_TTL);
    return res.json({
      access_token,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token,
      scope: 'mcp',
    });
  }

  if (b.grant_type === 'refresh_token') {
    const payload = await unseal<{ t: string; mkz: string }>(b.refresh_token).catch(() => null);
    if (!payload || payload.t !== 'refresh') return res.status(400).json({ error: 'invalid_grant' });
    const access_token = await seal({ t: 'access', mkz: payload.mkz }, ACCESS_TTL);
    return res.json({ access_token, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS, scope: 'mcp' });
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

/**
 * Résout le header Authorization en token MyKeyz :
 *  - access_token OAuth (JWE) → on en extrait le token MyKeyz chiffré ;
 *  - sinon, valeur brute = PAT MyKeyz (compat bot / Claude Desktop).
 */
export async function resolveBearer(authorization?: string): Promise<string | null> {
  if (!authorization) return null;
  const value = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!value) return null;
  try {
    const p = await unseal<{ t: string; mkz: string }>(value);
    if (p.t === 'access' && p.mkz) return p.mkz;
  } catch {
    /* pas un jeton OAuth → on tente le PAT brut */
  }
  return value;
}

export { baseUrl };
