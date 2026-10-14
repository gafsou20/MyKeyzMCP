import { z } from 'zod';

/** Champ multilingue { fr, he, en } — toutes les langues optionnelles. */
export const i18nSchema = z
  .object({
    fr: z.string().nullable().optional(),
    he: z.string().nullable().optional(),
    en: z.string().nullable().optional(),
  })
  .describe('Champ multilingue (fr/he/en).');

/**
 * Valeur de référentiel en entrée : **id OU libellé**. Le serveur résout
 * (« NRP », "nrp", 3 et "3" désignent tous le statut 3). Inutile d'appeler
 * list_referentials avant : en cas d'erreur, le message liste les valeurs.
 */
export const refValue = z.union([z.number().int(), z.string().min(1)]);
export const refList = z.union([refValue, z.array(refValue)]);

export const ref = (model: string, extra = '') =>
  refValue.describe(`Référentiel ${model} — id ou libellé.${extra ? ' ' + extra : ''}`);
export const refs = (model: string, extra = '') =>
  refList.describe(`Référentiel ${model} — un ou plusieurs ids/libellés.${extra ? ' ' + extra : ''}`);

/** Date « YYYY-MM-DD ». */
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD');

/** Adresse postale (tous champs optionnels). */
export const adresseSchema = z
  .object({
    street_number: z.string().nullable().optional().describe('Numéro.'),
    route: z.string().nullable().optional().describe('Rue.'),
    locality: z.string().nullable().optional().describe('Ville (ex. "Ramat Gan", "Tel Aviv-Yafo").'),
    administrative_area_level_1: z.string().nullable().optional().describe('District.'),
    country: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    quartier_id: refValue.nullable().optional().describe('Quartier — id ou nom (calculé automatiquement par l’API si lat/lng fournis).'),
  })
  .describe('Adresse postale.');

/**
 * Critères d'une recherche acheteur = filtres de biens. **Format strict** :
 * il est traduit vers le format exact de l'API (`contact_search.data` =
 * filtres de `/propriete/listev2`). Champ omis/null = indifférent.
 */
export const criteriaShape = {
  villes: z.array(z.string()).optional().describe('Villes (référentiel Ville, ex. "Ramat Gan", "Tel Aviv").'),
  quartiers: z.array(refValue).optional().describe('Quartiers — ids ou noms (référentiel Quartier).'),
  transaction: refs('ProprieteTransaction', '"Vente"/"achat" ou "Location".').optional(),
  types_bien: refs('ProprieteBien', 'Ex. "Appartement", "Maison".').optional(),
  options_bien: refs('ProprieteBienOption', 'Ex. "Penthouse", "Duplex", "Rez de jardin" (dépend du type de bien).').optional(),
  pieces_min: z.number().nullable().optional().describe('Nombre de pièces minimum.'),
  pieces_max: z.number().nullable().optional(),
  surface_min: z.number().nullable().optional().describe('Surface m² minimum.'),
  surface_max: z.number().nullable().optional(),
  etage_min: z.number().nullable().optional(),
  etage_max: z.number().nullable().optional(),
  prix_min: z.number().nullable().optional().describe('Prix minimum (₪).'),
  prix_max: z.number().nullable().optional().describe('Budget maximum (₪).'),
  terrasse: z.boolean().nullable().optional().describe('true = exigé ; null/omis = indifférent.'),
  parking: z.boolean().nullable().optional(),
  jardin: z.boolean().nullable().optional(),
  toit: z.boolean().nullable().optional().describe('Toit-terrasse.'),
  ascenseur: z.boolean().nullable().optional(),
  meuble: z.boolean().nullable().optional(),
  cave: z.boolean().nullable().optional(),
};
export const criteriaSchema = z.object(criteriaShape);
export type CriteriaInput = z.infer<typeof criteriaSchema>;
