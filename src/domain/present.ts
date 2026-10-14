import * as ref from '../core/referentials.js';
import { epochToLocal } from '../core/dates.js';
import { i18nText } from '../core/format.js';
import { toNum } from '../core/text.js';
import { fromApiData } from './criteria.js';
import type {
  AgendaEvent,
  Contact,
  ContactCommentaire,
  ContactSearch,
  Projet,
  Propriete,
} from '../types/models.js';
import type { Adresse } from '../types/api.js';

/**
 * Projections lisibles des objets MyKeyz : chaque champ de jointure devient un
 * couple `{ id, label }` (cf. docs/JOINTURES.md), les dates deviennent lisibles
 * (heure d'Israël) et les nombres stockés en texte sont convertis.
 */

/** Agent : `User` (périmètre visible) puis repli sur tous les agents. */
export function agent(id: unknown): ref.RefPair | null {
  if (id === null || id === undefined) return null;
  if (ref.item('User', id)) return ref.pair('User', id);
  if (ref.item('ContactCommentaireAgent', id)) return ref.pair('ContactCommentaireAgent', id);
  return ref.pair('User', id);
}

export function fullName(c: Partial<Contact> | null | undefined): string {
  if (!c) return '';
  return [c.prenom, c.nom, c.socite].filter((x) => x && String(x).trim()).join(' ').trim() || `#${c.id}`;
}

function adresse(a: Adresse | null | undefined) {
  if (!a || Array.isArray(a)) return null;
  const ligne = [a.street_number, a.route, a.locality].filter(Boolean).join(' ').trim();
  return {
    ligne: ligne || null,
    ville: a.locality ?? null,
    quartier: ref.pair('Quartier', a.quartier_id),
    ...(a.latitude && a.longitude ? { gps: { lat: a.latitude, lng: a.longitude } } : {}),
  };
}

export function contact(c: Contact) {
  return {
    id: c.id,
    nom_complet: fullName(c),
    prenom: c.prenom || null,
    nom: c.nom || null,
    societe: c.socite || null,
    telephone: c.telephone || null,
    mobile: c.mobile || null,
    email: c.email || null,
    statut: ref.pair('ContactStatus', c.status_id),
    categorie: ref.pair('ContactCategorie', c.categorie_id),
    categorie_option: ref.pair('ContactCategorieOption', c.categorie_option_id),
    source: ref.pair('ContactSource', c.source_id),
    langue: ref.pair('Langue', c.langue_id),
    agent: agent(c.user_id),
    important: Boolean(c.important),
    budget: toNum(c.budget),
    cree_le: epochToLocal(c.date_create),
    modifie_le: epochToLocal(c.date_update),
  };
}

export function contactDetail(c: Contact) {
  const old = Array.isArray(c.old_user) ? c.old_user : [];
  return {
    ...contact(c),
    description: c.description || null,
    anciens_agents: old.map(agent).filter(Boolean),
    historique_ancien: c.commentaire || null,
  };
}

export function comment(c: ContactCommentaire) {
  return {
    id: c.id,
    texte: c.txt,
    auteur: ref.pair('ContactCommentaireAgent', c.user_id) ?? agent(c.user_id),
    date: epochToLocal(c.date_create),
  };
}

export function search(s: ContactSearch) {
  return {
    id: s.id,
    contact_id: s.contact_id,
    statut: ref.pair('ContactSearchStatus', s.status_id),
    criteres: fromApiData(s.data),
    nb_biens_correspondants: typeof s.nb === 'number' ? s.nb : null,
  };
}

const EQUIPEMENTS: [keyof Propriete, string][] = [
  ['terrace', 'terrasse'],
  ['jardin', 'jardin'],
  ['toit', 'toit-terrasse'],
  ['ascenseur', 'ascenseur'],
  ['parking', 'parking'],
  ['cave', 'cave'],
  ['vue_mer', 'vue mer'],
  ['meuble', 'meublé'],
  ['luxe', 'luxe'],
];

export function propriete(p: Propriete & { origine_id?: number }) {
  const origine = p.origine_id ? ref.pair('ScraperSource', p.origine_id) : null;
  return {
    id: p.id,
    ref: p.ref ?? null,
    titre: i18nText(p.titre) || null,
    transaction: ref.pair('ProprieteTransaction', p.transaction_id),
    type_bien: ref.pair('ProprieteBien', p.bien_id),
    option_bien: ref.pair('ProprieteBienOption', p.bien_option_id),
    etat: ref.pair('ProprieteEtat', p.etat_id),
    statut: ref.pair('ProprieteStatus', p.status_id),
    prix: toNum(p.prix_vente),
    pieces: toNum(p.nb_pieces),
    surface: toNum(p.superficie),
    etage: toNum(p.etage),
    adresse: adresse(p.adresse),
    agent: agent(p.user_id),
    ...(origine ? { origine_annonce: origine } : {}),
    modifie_le: epochToLocal((p as { date_update?: number }).date_update),
  };
}

export function proprieteDetail(p: Propriete) {
  return {
    ...propriete(p),
    description: i18nText(p.description) || null,
    commentaire: (p as { commentaire?: string }).commentaire || null,
    prix_fermeture: toNum(p.prix_fermeture),
    prix_m2: toNum(p.prix_m2),
    surface_terrain: toNum(p.superficie_terrain),
    surface_terrasse: toNum(p.terrace_superficie),
    places_parking: toNum(p.parking_place),
    num_apt: p.num_apt ?? null,
    orientation: p.orientation ?? null,
    equipements: EQUIPEMENTS.filter(([k]) => p[k] === true).map(([, l]) => l),
    exclusivite: p.exclus ? { active: true, expire_le: p.exclus_expire ?? null } : { active: false },
    source: ref.pair('ContactSource', p.source_id),
    proprietaire_contact_id: p.contact_id ?? null,
    projet_id: p.projet_id ?? null,
    sur_site_web: Boolean(p.website),
    cree_le: epochToLocal((p as { date_create?: number }).date_create),
  };
}

export function event(e: AgendaEvent) {
  return {
    id: e.id,
    titre: e.data?.titre ?? null,
    date: e.data?.date ?? null,
    heure: e.data?.heure ?? null,
    categorie: ref.pair('AgendaCategorie', e.data?.categorie_id),
    description: e.data?.description ?? null,
    telephone: e.data?.telephone ?? null,
    rattachement: e.model && e.model_id ? { type: e.model, id: e.model_id } : null,
    agent: agent(e.user_id),
  };
}

export function projet(p: Projet) {
  return {
    id: p.id,
    ref: p.ref ?? null,
    nom: p.nom || p.ref || `#${p.id}`,
    promoteur: p.promoteur || null,
    statut: ref.pair('ProjetStatus', p.status_id),
    type: ref.pair('ProjetType', p.type_id),
    pre_type: ref.pair('ProjetPreType', p.pre_type_id),
    prix_min: toNum(p.prix_min),
    prix_max: toNum(p.prix_max),
    pieces_min: toNum(p.nb_pieces_min),
    pieces_max: toNum(p.nb_pieces_max),
    date_livraison: p.date_livraison || null,
    adresse: adresse(p.adresse),
    agent: agent(p.user_id),
  };
}

export function projetDetail(p: Projet) {
  return {
    ...projet(p),
    constructeur: p.constructeur || null,
    // Ancien format booléen obsolète → non renseigné.
    permis: typeof p.permis === 'number' ? ref.pair('ProjetPermis', p.permis) : null,
    garantie_bancaire: p.garantie ? p.garantie_name || true : false,
    caracteristiques: ref.pairs('ProjetCaracteristique', p.caracteristique_id),
    luxe: Boolean(p.luxe),
    contact_promoteur_id: p.contact_id ?? null,
    sur_site_web: Boolean(p.website),
  };
}
