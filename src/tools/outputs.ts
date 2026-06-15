import { z } from 'zod';

/** Valeur de jointure : libellé résolu (string) ou id brut si non résolu. */
const idLabel = z.union([z.string(), z.number()]);
const nstr = z.string().nullable().optional();
const nnum = z.number().nullable().optional();
const rdv = z.array(z.object({ titre: nstr, date: nstr, heure: nstr }));

const listMeta = { total: z.number(), page: z.number(), count: z.number() };

// ── Référentiels ──────────────────────────────────────────────────────────────
export const referentialOut = z.object({
  note: z.string().optional(),
  hint: z.string().optional(),
  available_models: z.array(z.string()).optional(),
  model: z.string().optional(),
  count: z.number().optional(),
  items: z.array(z.object({ id: z.number(), label: z.string(), key: z.string() })).optional(),
});

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contactItem = z.object({
  id: z.number(),
  nom: z.string(),
  telephone: nstr,
  mobile: nstr,
  email: nstr,
  statut: idLabel,
  source: idLabel,
  agent: idLabel,
  important: z.boolean().nullable().optional(),
  budget: nnum,
});
export const contactList = z.object({ ...listMeta, contacts: z.array(contactItem) });
export const contactDetail = contactItem.extend({
  categorie: nstr,
  langue: nstr,
  commentaire: nstr,
  recherches: z.number(),
  biens_lies: z.number(),
  projets_lies: z.number(),
  rdv,
  commentaires: z.array(z.object({ texte: nstr, auteur: idLabel, date: nnum })),
});

// ── Biens ─────────────────────────────────────────────────────────────────────
export const proprieteItem = z.object({
  id: z.number(),
  ref: nstr,
  titre: idLabel,
  transaction: nstr,
  type_bien: nstr,
  statut: idLabel,
  etat: nstr,
  prix: nnum,
  superficie: nnum,
  nb_pieces: nnum,
  etage: nnum,
  adresse: nstr,
  agent: idLabel,
});
export const proprieteList = z.object({ ...listMeta, proprietes: z.array(proprieteItem) });
export const proprieteDetail = proprieteItem.extend({
  description: nstr,
  proprietaire: nstr,
  projet_lie: nstr,
  acheteurs_potentiels: z.number(),
  rdv,
});

// ── Agenda ────────────────────────────────────────────────────────────────────
export const agendaEvent = z.object({
  id: z.number(),
  titre: nstr,
  date: nstr,
  heure: nstr,
  categorie: idLabel,
  telephone: nstr,
  description: nstr,
  rattachement: z.object({ type: z.string(), id: z.number() }).nullable(),
  agent: idLabel,
});
export const agendaList = z.object({ ...listMeta, evenements: z.array(agendaEvent) });
export const agendaSearch = z.object({ count: z.number(), evenements: z.array(agendaEvent) });

// ── Projets ───────────────────────────────────────────────────────────────────
export const projetItem = z.object({
  id: z.number(),
  ref: nstr,
  nom: z.string(),
  promoteur: nstr,
  statut: idLabel,
  prix_min: nnum,
  prix_max: nnum,
  date_livraison: nstr,
  adresse: nstr,
  agent: idLabel,
});
export const projetList = z.object({ ...listMeta, projets: z.array(projetItem) });
export const projetDetail = projetItem.extend({
  constructeur: nstr,
  contact: nstr,
  lots_lies: z.number(),
});

// ── Transactions ──────────────────────────────────────────────────────────────
export const transactionItem = z.object({
  id: z.number(),
  type: idLabel,
  client: nstr,
  bien: nstr,
  montant_ht: z.number(),
  tva_percent: z.number(),
  total_ttc: z.number(),
  date: nstr,
  agents: z.array(z.object({ agent: z.string(), commission_ht: z.number() })),
});
export const transactionList = z.object({ ...listMeta, transactions: z.array(transactionItem) });

// ── GED / actions diverses ─────────────────────────────────────────────────────
export const gedItem = z.object({
  id: z.number(),
  type_id: z.number().optional(),
  model: z.string().optional(),
  model_id: z.number().optional(),
  titre: z.string().optional(),
  url: z.string().optional(),
  link: z.string().optional(),
});
export const gedList = z.object({ files: z.array(gedItem) });

/** Réponse générique pour les actions à sortie variable (upload, IA, suppression…). */
export const genericResult = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  result: z.unknown().optional(),
});

export const commentOut = z.object({
  ok: z.boolean(),
  comment: z.unknown().optional(),
});

export const searchOut = z.object({
  ok: z.boolean(),
  searches: z.unknown().optional(),
});
