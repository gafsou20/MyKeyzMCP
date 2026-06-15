import { http } from '../core/client.js';

export interface LoginResult {
  id?: number;
  token?: string;
  email?: string;
  nom?: string;
  prenom?: string;
  [key: string]: unknown;
}

/**
 * POST /authorization/create — login email/mot de passe MyKeyz → profil + token.
 * Endpoint public (aucun token requis) ; sert de socle au pont OAuth.
 */
export const login = (email: string, password: string) =>
  http.post<LoginResult>('/authorization/create', { email, password });
