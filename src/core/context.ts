import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  /** Token MyKeyz porté par la requête courante. */
  token: string | null;
  /** URL publique du serveur vue par l'appelant (liens de dépôt de fichiers). */
  baseUrl?: string;
}

/**
 * Contexte par requête. Chaque appel HTTP s'exécute dans `runWithToken({ token })`
 * pour isoler les utilisateurs concurrents — il n'y a **aucun token côté serveur** :
 * le serveur est multi-locataire, chaque appelant fournit le sien.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Token « par défaut » du process. Reste **null** en HTTP (multi-utilisateur).
 * Uniquement renseigné par l'entrée stdio mono-poste (Claude Desktop local),
 * où le token vient de la config du client qui lance le process.
 */
let defaultToken: string | null = null;
export function setDefaultToken(token: string | null): void {
  defaultToken = token;
}

/** Exécute `fn` avec un token de requête isolé. */
export function runWithToken<T>(token: string | null, fn: () => T, baseUrl?: string): T {
  return requestContext.run({ token, baseUrl }, fn);
}

/** URL publique du serveur pour la requête courante (null en stdio). */
export function currentBaseUrl(): string | null {
  return requestContext.getStore()?.baseUrl ?? null;
}

/** Token courant : contexte de requête, sinon token par défaut (stdio), sinon null. */
export function currentToken(): string | null {
  return requestContext.getStore()?.token ?? defaultToken;
}
