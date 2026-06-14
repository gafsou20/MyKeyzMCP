import { API_BASE_URL } from './config.js';
import { getAuthToken } from './token.js';
import { sanitize } from './normalize.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Erreur réseau (hors-ligne, timeout). */
export class NetworkError extends Error {
  constructor(message = 'network_unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** true = ne pas normaliser (réponses binaires/HTML). */
  raw?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/**
 * Déballe l'enveloppe API.
 *  - `{ status, data }`  → si status=false → ApiError ; sinon renvoie `data`
 *  - datatable `{ currentPage, limitPage, totalRow, data }` → renvoyé tel quel
 *  - autre → renvoyé tel quel
 */
function unwrap(json: unknown): unknown {
  if (json !== null && typeof json === 'object' && 'status' in json) {
    const env = json as { status: boolean; data: unknown };
    if (env.status === false) {
      const msg = typeof env.data === 'string' ? env.data : 'request_failed';
      throw new ApiError(msg, 200, env.data);
    }
    return env.data;
  }
  return json;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = token; // token brut, pas de "Bearer"

  let body: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new NetworkError();
  }

  if (res.status === 401) {
    throw new ApiError('unauthorized — token MyKeyz invalide, expiré ou révoqué', 401);
  }
  if (!res.ok) {
    throw new ApiError(`http_${res.status}`, res.status);
  }

  if (opts.raw) {
    return (await res.text()) as unknown as T;
  }

  const json = await res.json().catch(() => null);
  const data = unwrap(json);
  return sanitize<T>(data);
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query, signal?: AbortSignal) =>
    request<T>('POST', path, { body, query, signal }),
  raw: <T>(path: string, query?: Query) => request<T>('GET', path, { query, raw: true }),
};
