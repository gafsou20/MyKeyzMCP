/** Réponse paginée des endpoints `/liste` (DataQuery::datatable). */
export interface DataTable<T> {
  currentPage: number;
  limitPage: number | null;
  totalRow: number;
  data: T[];
  /** certains endpoints ajoutent des méta (ex. wa/liste → groupes). */
  meta?: Record<string, unknown>;
}

/** Corps standard d'un appel `/liste`. */
export interface ListQuery {
  filters?: Record<string, unknown>;
  sort?: { key: string; value: 'ASC' | 'DESC' };
  limit?: number;
  page?: number;
}

export const defaultListQuery = (overrides: Partial<ListQuery> = {}): ListQuery => ({
  filters: {},
  sort: { key: 'id', value: 'DESC' },
  limit: 25,
  page: 1,
  ...overrides,
});

/** Champ multilingue tel que stocké en base (fr/he/en). */
export type I18nField = Partial<Record<'fr' | 'he' | 'en', string | null>>;

export interface Adresse {
  street_number?: string | null;
  route?: string | null;
  locality?: string | null;
  administrative_area_level_1?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  quartier_id?: number | null;
  quartier?: string | null;
}
