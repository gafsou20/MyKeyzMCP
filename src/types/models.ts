import type { Adresse, I18nField } from './api.js';

export interface CurrentUser {
  id: number;
  token?: string;
  expire_at?: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  role_id: number;
  acl: number[];
  user_id: number[];
  current_env: number;
  env_id: number[];
}

export interface User {
  id: number;
  nom: string;
  prenom: string;
  telephone?: string;
  email?: string;
  acl: number[];
  user_id: number[];
  role_id: number;
  status_id: number;
  env_id: number[];
  current_env?: number;
  nb_lead_jour?: number | null;
  status?: number;
  date_create?: number;
  date_update?: number;
}

export interface Contact {
  id: number;
  user_id: number;
  old_user: number[];
  status_id: number;
  source_id: number;
  categorie_id: number | null;
  categorie_option_id: number | null;
  prenom: string | null;
  nom: string | null;
  socite: string | null;
  telephone: string | null;
  mobile: string | null;
  email: string | null;
  budget: number | null;
  commentaire: string | null;
  important: boolean;
  langue_id: number | null;
  description?: string | null;
  env_id: number;
  status?: number;
  date_create?: number;
  date_update?: number;
  titre?: string;
}

export interface ContactSearch {
  id: number | null;
  contact_id: number | null;
  uuid: string | null;
  status_id: number;
  data: Record<string, unknown>;
  env_id: number;
  nb?: number;
}

export interface ContactCommentaire {
  id: number;
  contact_id: number;
  user_id: number;
  txt: string;
  date_create?: number;
}

export interface Propriete {
  id: number;
  uuid?: string | null;
  ref: string | null;
  contact_id: number | null;
  user_id: number;
  projet_id: number | null;
  bien_id: number | null;
  bien_option_id: number | null;
  transaction_id: number | null;
  etat_id: number | null;
  source_id: number | null;
  status_id: number;
  titre: I18nField;
  description: I18nField;
  site?: { titre?: I18nField; description?: I18nField; slug?: I18nField; mots_cles?: I18nField };
  adresse: Adresse;
  superficie: number | null;
  superficie_terrain: number | null;
  etage: number | null;
  nb_pieces: number | null;
  orientation: string | null;
  num_apt: string | null;
  prix_vente: number | null;
  prix_fermeture: number | null;
  prix_m2: number | null;
  terrace: boolean;
  terrace_superficie: number | null;
  jardin: boolean;
  toit: boolean;
  ascenseur: boolean;
  parking: boolean;
  parking_place: number | null;
  cave: boolean;
  vue_mer: boolean;
  meuble: boolean;
  luxe: boolean;
  exclus: boolean;
  exclus_expire?: string | null;
  website: boolean;
  image_primary: string | null;
  env_id: number;
  color_id?: number;
}

export interface Projet {
  id: number;
  ref: string | null;
  status_id: number;
  contact_id: number | null;
  type_id: number | null;
  pre_type_id: number | null;
  user_id: number;
  nom: string | null;
  promoteur: string | null;
  constructeur: string | null;
  date_livraison: string | null;
  garantie: boolean;
  garantie_name: string | null;
  permis: number | boolean;
  luxe: boolean;
  adresse: Adresse;
  prix_min: number | null;
  prix_max: number | null;
  nb_pieces_min: number | null;
  nb_pieces_max: number | null;
  caracteristique_id: number[];
  site?: Record<string, I18nField>;
  website: boolean;
  image_primary: string | null;
  env_id: number;
}

export interface TransactionAgent {
  id: number;
  nom: string;
  prenom: string;
  commission_ht: number;
  tva_percent: number;
  isNew?: boolean;
}

export interface Transaction {
  id: number;
  type_id: number;
  client: { id: number | null; nom: string | null; prenom: string | null };
  propriete: { id: number | null; titre: string | null };
  agents: TransactionAgent[];
  montant_ht: number;
  tva_percent: number;
  date: string | null;
  env_id: number;
}

export interface AgendaEvent {
  id: number;
  user_id: number;
  env_id: number;
  model?: string;
  model_id?: number;
  data: {
    titre: string | null;
    date: string | null;
    heure: string | null;
    timezone?: string | null;
    description: string | null;
    categorie_id: number;
    url: string | null;
    telephone?: string | null;
  };
  dateO?: string;
  week?: number;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  read: boolean;
  icon?: string;
  link?: string;
  date_create?: number;
}

export interface Ged {
  id: number;
  type_id: number;
  model: string;
  model_id: number;
  titre: string;
  url: string;
  link?: string;
}

export interface Quartier {
  id: number;
  color: string;
  titre: I18nField;
  geometry: { type: string; coordinates: number[][][] };
  mots_cles?: I18nField;
}

/** Item générique d'un référentiel `param`. */
export interface ParamItem {
  id: number;
  titre: string;
  titre_fr?: string;
  titre_he?: string;
  titre_en?: string;
  color?: string;
  [key: string]: unknown;
}

export interface MenuItem {
  id: number;
  module_id: number;
  titre: string;
  icon: string;
  path: string;
  label: string;
}

export interface ParamAll {
  menu: MenuItem[];
  params: Record<string, ParamItem[]>;
}
