import { MYKEYZ_TOKEN } from './config.js';

/**
 * Conteneur de token. En mode stdio mono-utilisateur, il est alimenté par le
 * `.env` (MYKEYZ_TOKEN). L'API attend ce token brut dans le header `Authorization`.
 *
 * `setAuthToken` permet de surcharger dynamiquement (utile pour une future
 * version HTTP multi-utilisateur où le token vient de la session appelante).
 */
let token: string | null = MYKEYZ_TOKEN || null;

export function setAuthToken(value: string | null): void {
  token = value;
}

export function getAuthToken(): string | null {
  return token;
}
