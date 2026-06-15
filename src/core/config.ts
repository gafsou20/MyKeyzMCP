import 'dotenv/config';

/** Base de l'API MyKeyz. */
export const API_BASE_URL = process.env.MYKEYZ_API_URL ?? 'https://api.mykeyz.jg.app';

/**
 * Token pour l'entrée **stdio uniquement** (Claude Desktop local, mono-poste) :
 * fourni par la config du client qui lance le process. Le serveur HTTP n'utilise
 * **jamais** ce token : il est multi-locataire et reçoit le token par requête.
 */
export const STDIO_TOKEN = process.env.MYKEYZ_TOKEN ?? '';

/** Langue par défaut pour la résolution des libellés de référentiels. */
export const DEFAULT_LOCALE: 'fr' | 'he' | 'en' = 'fr';

/**
 * Secret de (dé)chiffrement des jetons OAuth émis par ce serveur (codes +
 * access/refresh tokens, chiffrés via JWE). À définir en prod (config Plesk).
 */
export const OAUTH_SECRET = process.env.OAUTH_JWT_SECRET ?? '';

/**
 * URL publique du serveur (ex. https://mcp.mykeyz.jg.app). Utilisée dans les
 * métadonnées OAuth. À défaut, déduite des en-têtes X-Forwarded-* de la requête.
 */
export const PUBLIC_URL = process.env.PUBLIC_URL ?? '';
