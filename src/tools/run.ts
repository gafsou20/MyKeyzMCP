import * as ref from '../core/referentials.js';
import { explain } from '../core/errors.js';

type Result = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Réponse texte JSON compacte + structuredContent. */
export function ok(obj: Record<string, unknown>): Result {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj) }],
    structuredContent: obj,
  };
}

/** Réponse d'erreur actionnable pour l'agent (pas d'exception brute). */
export function fail(message: string): Result {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Enveloppe commune des outils : charge les référentiels (nécessaires aux
 * jointures), exécute, et transforme toute erreur en message explicite.
 */
export function handler<A>(fn: (args: A) => Promise<Record<string, unknown>>) {
  return async (args: A): Promise<Result> => {
    try {
      await ref.ensureLoaded();
      return ok(await fn(args));
    } catch (e) {
      return fail(explain(e));
    }
  };
}

/** Pagination standard des listes. */
export function page<T>(res: { totalRow?: number; currentPage?: number; data?: T[] }, limit: number) {
  const total = Number(res.totalRow ?? 0);
  const current = Number(res.currentPage ?? 1);
  const count = res.data?.length ?? 0;
  return {
    total,
    page: current,
    count,
    ...(current * limit < total ? { page_suivante: current + 1 } : {}),
  };
}
