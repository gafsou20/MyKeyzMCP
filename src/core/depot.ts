import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/**
 * Sans DEPOT_SECRET / OAUTH_JWT_SECRET (cas de la prod au 01/11/2026), la clé était propre à chaque processus :
 * Plesk / Passenger lance plusieurs processus et les recycle → « Lien expiré » dès l'ouverture du lien.
 * Repli : clé aléatoire créée UNE fois et gardée dans un fichier (DEPOT_KEY_FILE, défaut `.depot-secret` à la racine,
 * droits 600, hors git) → la même clé pour tous les processus et après redémarrage.
 */
function fileSecret(): string {
  const file = resolve(process.env.DEPOT_KEY_FILE || '.depot-secret');
  try {
    const v = readFileSync(file, 'utf8').trim();
    if (v.length >= 32) return v;
  }
  catch { /* absent : on le crée */ }
  try {
    const v = randomBytes(32).toString('hex');
    writeFileSync(file, v, { mode: 0o600, flag: 'wx' });
    return v;
  }
  catch {
    // créé entre-temps par un autre processus : on le relit
    try {
      const v = readFileSync(file, 'utf8').trim();
      if (v.length >= 32) return v;
    }
    catch { /* dossier non inscriptible */ }
  }
  return '';
}

const secret = process.env.DEPOT_SECRET || process.env.OAUTH_JWT_SECRET || fileSecret();
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
