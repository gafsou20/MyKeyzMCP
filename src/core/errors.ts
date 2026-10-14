import { ApiError, NetworkError } from './client.js';

/** Erreur destinée à l'agent : message actionnable (quoi corriger). */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/** Traduit une erreur technique en message utile pour l'agent. */
export function explain(e: unknown): string {
  if (e instanceof ToolError) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Session MyKeyz invalide ou expirée : l’utilisateur doit se reconnecter au connecteur.';
    if (e.status === 403) return 'Accès refusé par MyKeyz (droit/ACL manquant pour cette action).';
    if (e.status === 404) return 'Ressource introuvable côté MyKeyz.';
    return `MyKeyz a refusé l’opération : ${e.message}`;
  }
  if (e instanceof NetworkError) return 'API MyKeyz injoignable (réseau). Réessaie plus tard.';
  return `Erreur inattendue : ${(e as Error)?.message ?? String(e)}`;
}
