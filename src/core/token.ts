import { currentToken } from './context.js';

/**
 * Le client HTTP récupère le token via cette fonction. La résolution est
 * déléguée au contexte de requête (HTTP) avec repli sur le `.env` (stdio).
 * Voir `core/context.ts`.
 */
export function getAuthToken(): string | null {
  return currentToken();
}
