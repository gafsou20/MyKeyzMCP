import { http } from '../core/client.js';

/**
 * Génération de contenu SEO (titre/description multilingue) via OpenAI côté API,
 * puis **sauvegarde** sur la fiche. ACL 22.
 */
export const propriete = (id: number) => http.get<unknown>(`/ai/propriete/${id}`);
export const projet = (id: number) => http.get<unknown>(`/ai/projet/${id}`);
