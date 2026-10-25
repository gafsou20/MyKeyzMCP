import { createHash, randomBytes } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

/**
 * Liens de dépôt de fichiers (GED) : un lien temporaire ouvre une page web où l'utilisateur dépose photos et
 * documents, envoyés à la GED de la fiche visée avec SON token MyKeyz.
 *
 * Le jeton du lien est un JWE (A256GCM) : opaque, infalsifiable, il contient le token MyKeyz **chiffré** et ne
 * vaut que pour UNE fiche, pendant DEPOT_TTL. Clé : DEPOT_SECRET, sinon OAUTH_JWT_SECRET, sinon clé aléatoire du
 * processus (les liens ne survivent alors pas à un redémarrage, ni d'un processus à l'autre si Plesk en lance
 * plusieurs) — jamais la clé de repli connue de crypto.ts : le lien transporte un token d'accès.
 */
export const DEPOT_TTL = '30m';

const secret = process.env.DEPOT_SECRET || process.env.OAUTH_JWT_SECRET || '';
export const DEPOT_KEY_EPHEMERAL = !secret;
const key = secret ? createHash('sha256').update(`depot:${secret}`).digest() : randomBytes(32);

export interface DepotClaims {
  /** Token MyKeyz de l'utilisateur. */
  tok: string;
  /** Fiche visée. */
  model: 'Propriete' | 'Projet';
  model_id: number;
  /** Type de document GED (id). */
  type_id: number;
  /** Libellés pour la page (type de document, fiche). */
  type_label: string;
  fiche: string;
}

export async function sealDepot(c: DepotClaims): Promise<string> {
  return new EncryptJWT({ ...c, use: 'depot' })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(DEPOT_TTL)
    .encrypt(key);
}

/** Déchiffre un jeton de dépôt ; null s'il est invalide, expiré ou d'un autre usage. */
export async function unsealDepot(token: string): Promise<(DepotClaims & { exp: number }) | null> {
  try {
    const { payload } = await jwtDecrypt(token, key);
    if (payload.use !== 'depot' || typeof payload.tok !== 'string') return null;
    return payload as unknown as DepotClaims & { exp: number };
  } catch {
    return null;
  }
}
