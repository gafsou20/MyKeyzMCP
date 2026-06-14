import { http } from '../core/client.js';
import type { ListQuery, DataTable } from '../types/api.js';
import { defaultListQuery } from '../types/api.js';
import type {
  Contact,
  ContactSearch,
  ContactCommentaire,
  Propriete,
  Projet,
  AgendaEvent,
} from '../types/models.js';

export interface ContactDetail {
  contact: Contact;
  agenda: AgendaEvent[];
  searchs: ContactSearch[];
  proprietes: Propriete[];
  projets: Projet[];
  commentaires: ContactCommentaire[];
}

export const list = (q: ListQuery = defaultListQuery()) =>
  http.post<DataTable<Contact>>('/contact/liste', q);

export const newContact = () => http.get<Contact>('/contact/new');

export const get = (id: number) => http.get<ContactDetail>(`/contact/${id}`);

export const create = (payload: Partial<Contact> & { id?: number }) =>
  http.post<Contact>('/contact/create', payload);

export const newSearch = () => http.get<ContactSearch>('/contact/search/new');

export const createSearch = (payload: Partial<ContactSearch> & { id?: number }) =>
  http.post<ContactSearch[]>('/contact/search/create', payload);

export const addComment = (contact_id: number, txt: string, id?: number) =>
  http.post<ContactCommentaire>('/contact/commentaire', { contact_id, txt, id });
