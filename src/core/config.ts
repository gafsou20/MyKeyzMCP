import 'dotenv/config';

/** Base de l'API MyKeyz. */
export const API_BASE_URL = process.env.MYKEYZ_API_URL ?? 'https://api.mykeyz.jg.app';

/** Token MyKeyz (longue durée, révocable) lu depuis l'environnement. */
export const MYKEYZ_TOKEN = process.env.MYKEYZ_TOKEN ?? '';

/** Environnement multi-tenant optionnel forcé pour la session. */
export const MYKEYZ_ENV = process.env.MYKEYZ_ENV ? Number(process.env.MYKEYZ_ENV) : undefined;

/** Langue par défaut pour la résolution des libellés de référentiels. */
export const DEFAULT_LOCALE: 'fr' | 'he' | 'en' = 'fr';
