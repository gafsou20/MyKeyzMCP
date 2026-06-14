import { http } from '../core/client.js';
import type { ListQuery, DataTable } from '../types/api.js';
import { defaultListQuery } from '../types/api.js';
import type { Transaction } from '../types/models.js';

export const list = (q: ListQuery = defaultListQuery()) =>
  http.post<DataTable<Transaction>>('/transaction/liste', q);

export const get = (id: number) => http.get<Transaction>(`/transaction/${id}`);
