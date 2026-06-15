import { http } from '../core/client.js';
import type { ListQuery, DataTable } from '../types/api.js';
import { defaultListQuery } from '../types/api.js';
import type { AgendaEvent } from '../types/models.js';

export const list = (q: ListQuery = defaultListQuery({ sort: { key: 'dateO', value: 'ASC' } })) =>
  http.post<DataTable<AgendaEvent>>('/agenda/liste', q);

export const get = (id: number) => http.get<AgendaEvent>(`/agenda/${id}`);

export const create = (payload: Partial<AgendaEvent> & { id?: number }) =>
  http.post<AgendaEvent>('/agenda/create', payload);

/** GET /agenda/delete/{id} — suppression (hard delete côté API). */
export const remove = (id: number) => http.get<string>(`/agenda/delete/${id}`);

export const search = (q: string) =>
  http.get<AgendaEvent[]>(`/agenda/search/${encodeURIComponent(q)}`);
