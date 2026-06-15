import { http } from '../core/client.js';
import type { Ged } from '../types/models.js';

/** GET /ged/liste?model=&model_id= — fichiers liés à une entité. */
export const list = (model: string, model_id: number) =>
  http.get<Ged[]>('/ged/liste', { model, model_id });

/** POST /ged/upload — fichier base64 (+ rattachement optionnel). */
export const upload = (file: string, file_name: string, ged?: Partial<Ged>) =>
  http.post<Ged | string>('/ged/upload', { file, file_name, ged });

/** GET /ged/delete/{id} — suppression d'un fichier. */
export const remove = (id: number) => http.get<string>(`/ged/delete/${id}`);
