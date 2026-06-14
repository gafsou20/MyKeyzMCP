import { AsyncLocalStorage } from 'node:async_hooks';
import { MYKEYZ_TOKEN } from './config.js';

export interface RequestContext {
  /** Token MyKeyz porté par la requête courante (mode HTTP multi-utilisateur). */
  token: string | null;
}

/**
 * Contexte par requête. En HTTP, chaque appel s'exécute dans `run({ token })`
 * pour isoler les utilisateurs concurrents. En stdio, il n'y a pas de contexte
 * et on retombe sur le token du `.env`.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Exécute `fn` avec un token de requête isolé. */
export function runWithToken<T>(token: string | null, fn: () => T): T {
  return requestContext.run({ token }, fn);
}

/**
 * Token courant : contexte de requête (HTTP) en priorité, puis repli sur le
 * `.env` (stdio mono-utilisateur). Renvoie null si aucun n'est disponible.
 */
export function currentToken(): string | null {
  const ctx = requestContext.getStore();
  if (ctx) return ctx.token;
  return MYKEYZ_TOKEN || null;
}
