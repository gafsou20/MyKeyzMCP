import { http } from '../core/client.js';
import type { ParamAll, ParamItem } from '../types/models.js';

/** GET /param/all — bootstrap : menu (ACL) + tous les référentiels de jointure. */
export const all = () => http.get<ParamAll>('/param/all');

/** GET /param/liste — (admin) référentiels bruts. */
export const liste = () => http.get<ParamItem[]>('/param/liste');
