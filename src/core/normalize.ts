/**
 * Normalisation des réponses MongoDB renvoyées par l'API Phalcon.
 *
 * L'API expose des structures brutes peu stables :
 *  - `_id: { $oid: "..." }`            → on aplatit en string
 *  - `acl: { "0": 2, "1": 3 }`         → objet "array-like" → vrai tableau
 *  - `old_user: {}`                    → tableau vide sérialisé en objet (ambigu, voir asArray)
 *  - `password`                        → jamais conservé côté client
 */

const STRIPPED_KEYS = new Set(['password']);

function isArrayLike(keys: string[]): boolean {
  if (keys.length === 0) return false; // {} ambigu : laissé tel quel ici
  return keys.every((k, i) => k === String(i));
}

export function sanitize<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    // { $oid: "..." } → string
    if (keys.length === 1 && keys[0] === '$oid') {
      return obj.$oid as unknown as T;
    }
    // { $date: ... } / { $numberLong: ... } → valeur brute
    if (keys.length === 1 && (keys[0] === '$date' || keys[0] === '$numberLong')) {
      return obj[keys[0]] as unknown as T;
    }
    // objet "array-like" → tableau
    if (isArrayLike(keys)) {
      return keys.map((k) => sanitize(obj[k])) as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (STRIPPED_KEYS.has(k)) continue;
      out[k] = sanitize(obj[k]);
    }
    return out as T;
  }
  return value as T;
}

/**
 * Force une valeur en tableau. Gère le cas `{}` (tableau vide sérialisé en objet)
 * et `{ "0": x, "1": y }`. À utiliser pour les champs connus comme tableaux
 * (`acl`, `user_id`, `old_user`, `env_id`...).
 */
export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, T>);
  }
  if (value === null || value === undefined) return [];
  return [value as T];
}
