import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';
import { OAUTH_SECRET } from '../core/config.js';

// Clé symétrique 256 bits dérivée du secret. En dev sans secret, valeur de repli
// (NON sûre) pour ne pas planter — à définir absolument en prod.
const key = createHash('sha256')
  .update(OAUTH_SECRET || 'insecure-dev-secret-change-me')
  .digest();

/** Chiffre un payload en JWT chiffré (JWE A256GCM), opaque pour le client. */
export async function seal(payload: JWTPayload, expiration: string): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiration)
    .encrypt(key);
}

/** Déchiffre et valide (signature + expiration) un jeton émis par `seal`. */
export async function unseal<T extends JWTPayload = JWTPayload>(token: string): Promise<T> {
  const { payload } = await jwtDecrypt(token, key);
  return payload as T;
}

export const OAUTH_ENABLED = Boolean(OAUTH_SECRET);
