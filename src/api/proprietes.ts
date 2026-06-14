import { http } from '../core/client.js';
import type { ListQuery, DataTable } from '../types/api.js';
import { defaultListQuery } from '../types/api.js';
import type { Propriete, Projet, Contact, ContactSearch, AgendaEvent } from '../types/models.js';

export interface ProprieteDetail {
  propriete: Propriete;
  agenda: AgendaEvent[];
  contact: Contact | false;
  projet: Projet | null;
  searchs: ContactSearch[];
}

/** POST /propriete/liste — mandats propres de l'environnement. */
export const list = (q: ListQuery = defaultListQuery()) =>
  http.post<DataTable<Propriete>>('/propriete/liste', q);

/** POST /propriete/listev2 — vue agrégée (mandats + biens scrapés). */
export const listV2 = (q: ListQuery = defaultListQuery()) =>
  http.post<DataTable<Propriete>>('/propriete/listev2', q);

export const get = (id: number) => http.get<ProprieteDetail>(`/propriete/${id}`);

export const create = (payload: Partial<Propriete> & { id?: number }) =>
  http.post<Propriete>('/propriete/create', payload);
