import { http } from '../core/client.js';
import type { DataTable, ListQuery } from '../types/api.js';
import type { Contact, ContactSearch } from '../types/models.js';

/**
 * Routes dédiées au MCP côté back (`routes/mcp.php` + `McpController.php`,
 * nouveaux fichiers, lecture seule, ajoutés le 14/10/2026).
 */

export type SearchWithContact = ContactSearch & {
  date_create?: number;
  date_update?: number;
  contact?: Partial<Contact>;
};

export interface SearchStats {
  total: number;
  par_ville: { _id: string; n: number }[];
  par_transaction: { _id: number; n: number }[];
  par_statut: { _id: number; n: number }[];
}

/** POST /mcp/search/liste — recherches acheteur de tout le périmètre. */
export const searchList = (q: ListQuery) => http.post<DataTable<SearchWithContact>>('/mcp/search/liste', q);

/** POST /mcp/search/stats — total + répartition ville / transaction / statut. */
export const searchStats = (filters: Record<string, unknown>) =>
  http.post<SearchStats>('/mcp/search/stats', { filters });

/** GET /mcp/propriete/{id}/buyers — matching bien → acheteurs robuste. */
export const buyers = (id: number, activesOnly: boolean) =>
  http.get<SearchWithContact[]>(`/mcp/propriete/${id}/buyers`, activesOnly ? { actives: '1' } : undefined);
