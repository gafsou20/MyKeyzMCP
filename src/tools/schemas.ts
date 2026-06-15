import { z } from 'zod';

/** Champ multilingue { fr, he, en } — toutes les langues optionnelles. */
export const i18nSchema = z
  .object({
    fr: z.string().nullable().optional(),
    he: z.string().nullable().optional(),
    en: z.string().nullable().optional(),
  })
  .describe('Champ multilingue (fr/he/en).');

/** Adresse postale (tous champs optionnels). */
export const adresseSchema = z
  .object({
    street_number: z.string().nullable().optional(),
    route: z.string().nullable().optional(),
    locality: z.string().nullable().optional(),
    administrative_area_level_1: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    quartier_id: z.number().nullable().optional(),
    quartier: z.string().nullable().optional(),
  })
  .describe('Adresse postale.');
