import { http } from '../core/client.js';
import type { ListQuery, DataTable } from '../types/api.js';
import { defaultListQuery } from '../types/api.js';
import type { Projet, Contact, Propriete } from '../types/models.js';

export interface ProjetDetail {
  projet: Projet;
  contact: Contact | null;
  proprietes: Propriete[];
  fields: { titre: string; field: string; display: boolean }[];
}

export const list = (q: ListQuery = defaultListQuery()) =>
  http.post<DataTable<Projet>>('/projet/liste', q);

export const get = (id: number) => http.get<ProjetDetail>(`/projet/${id}`);

export const create = (projet: Partial<Projet>, contact: Partial<Contact> = {}) =>
  http.post<{ projet: Projet; contact: Contact }>('/projet/create', { projet, contact });
