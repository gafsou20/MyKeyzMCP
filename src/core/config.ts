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
