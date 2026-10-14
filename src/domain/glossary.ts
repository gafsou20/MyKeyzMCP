/**
 * Glossaire métier MyKeyz : libellés FR lisibles + définitions des valeurs de
 * référentiels (Param). Les référentiels ne stockent qu'une clé technique
 * (`titre` en snake_case, ex. « nrp ») : ce glossaire la traduit pour l'agent.
 *
 * Indexé par **clé technique** (et non par id) pour rester juste si un id change.
 * Source : CRMMyKeyzV2 + docs/JOINTURES.md. Une clé absente = libellé humanisé.
 */

export interface GlossaryEntry {
  /** Libellé FR lisible. */
  label: string;
  /** Définition métier (optionnelle) pour lever l'ambiguïté. */
  meaning?: string;
  /** Synonymes acceptés en entrée (résolution libellé → id). */
  aliases?: string[];
}

export const GLOSSARY: Record<string, Record<string, GlossaryEntry>> = {
  ContactStatus: {
    nouveau_lead: { label: 'Nouveau lead', meaning: 'Prospect entrant, jamais traité.', aliases: ['nouveau', 'lead', 'new'] },
    a_rappeler: { label: 'À rappeler', meaning: 'Rappel prévu, le prospect a demandé à être recontacté.', aliases: ['rappeler', 'rappel'] },
    nrp: { label: 'NRP (ne répond pas)', meaning: 'Appelé sans réponse.', aliases: ['ne repond pas', 'pas de reponse', 'injoignable'] },
    pas_interesser: { label: 'Pas intéressé', meaning: 'Le prospect a décliné.', aliases: ['pas interesse', 'non interesse'] },
    errone: { label: 'Erroné', meaning: 'Coordonnées fausses ou lead invalide.', aliases: ['faux numero', 'invalide'] },
    client_mykeyz: { label: 'Client MyKeyz', meaning: 'Devenu client de l’agence.', aliases: ['client'] },
    en_cours: { label: 'En cours', meaning: 'Suivi actif en cours avec un agent.' },
    plus_actualite: { label: 'Plus d’actualité', meaning: 'Le projet du prospect est abandonné ou réalisé ailleurs.' },
    doublon: { label: 'Doublon', meaning: 'Contact déjà existant sous une autre fiche.' },
  },
  ContactCategorie: {
    client: { label: 'Client', meaning: 'Acheteur ou locataire (cherche un bien).' },
    prestataire: { label: 'Prestataire', meaning: 'Partenaire : avocat, agent, courtier, apporteur…' },
    proprietaire: { label: 'Propriétaire', meaning: 'Vendeur ou bailleur (a un bien à vendre/louer).', aliases: ['vendeur', 'bailleur'] },
    meshavek: { label: 'Meshavek', meaning: 'Société de commercialisation de programmes neufs (מְשַׁוֵּק). Réservé aux contacts de projet.', aliases: ['commercialisateur'] },
    promoteur: { label: 'Promoteur', meaning: 'Promoteur immobilier. Réservé aux contacts de projet.' },
  },
  ContactCategorieOption: {
    achat: { label: 'Achat' },
    location: { label: 'Location' },
    avocat: { label: 'Avocat' },
    agent_immobilier: { label: 'Agent immobilier' },
    courtier_credit: { label: 'Courtier en crédit' },
    promoteur: { label: 'Promoteur' },
    apporteur_affaire: { label: 'Apporteur d’affaires' },
    commercial_promoteur: { label: 'Commercial promoteur' },
    bien_vendre: { label: 'Bien à vendre' },
    bien_louer: { label: 'Bien à louer' },
    DG: { label: 'DG' },
    employer: { label: 'Employé' },
    'directeur commercial': { label: 'Directeur commercial' },
    commercial: { label: 'Commercial' },
  },
  ContactSearchStatus: {
    en_cours: { label: 'En cours', meaning: 'Recherche active : participe au matching.' },
    terminer: { label: 'Terminée', meaning: 'Recherche close.', aliases: ['termine', 'close', 'fini'] },
  },
  AgendaCategorie: {
    client_important: { label: 'Client important' },
    client_relance: { label: 'Relance client', aliases: ['relance'] },
  },
  ProprieteStatus: {
    disponible: { label: 'Disponible' },
    non_disponible: { label: 'Non disponible', aliases: ['indisponible', 'vendu', 'loue'] },
  },
  ProprieteTransaction: {
    achat_vente: { label: 'Vente', meaning: 'Bien à vendre (côté acheteur : achat).', aliases: ['achat', 'vente', 'buy', 'sale'] },
    location: { label: 'Location', aliases: ['louer', 'rent'] },
  },
  ProjetType: {
    tour_standing: { label: 'Tour de haut standing' },
    immeuble_boutique: { label: 'Immeuble boutique' },
    maison: { label: 'Maison' },
  },
  ProjetPreType: {
    habitation: { label: 'Habitation' },
    commercial: { label: 'Commercial' },
  },
  ProjetPermis: {
    obtenu: { label: 'Obtenu' },
    "en cours d'obtention": { label: 'En cours d’obtention' },
  },
  GedType: {
    image: { label: 'Image', aliases: ['photo'] },
    plan: { label: 'Plan' },
    brochure: { label: 'Brochure' },
    autre: { label: 'Autre' },
  },
  UserRole: {
    Admin: { label: 'Admin' },
    Utilisateur: { label: 'Agent', aliases: ['utilisateur'] },
    Relanceur: { label: 'Relanceur', meaning: 'Voit aussi les contacts dont il était l’ancien agent.' },
  },
  UserStatus: {
    actif: { label: 'Actif' },
    inactif: { label: 'Inactif' },
  },
};

export function glossaryEntry(model: string, key: string | undefined | null): GlossaryEntry | undefined {
  if (!key) return undefined;
  return GLOSSARY[model]?.[key];
}
