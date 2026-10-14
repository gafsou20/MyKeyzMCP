/**
 * Consignes globales envoyées au client MCP à l'initialisation (champ
 * `instructions`). Elles donnent à l'agent le modèle mental du CRM MyKeyz.
 */
export const INSTRUCTIONS = `
MyKeyz est le CRM d'une agence immobilière israélienne (Tel Aviv, Ramat Gan…). Les prix sont en shekels (₪), les dates en heure d'Israël.

OBJETS
- Contact : prospect, client acheteur/locataire, propriétaire, prestataire, promoteur. Possède un statut de suivi (Nouveau lead, NRP = ne répond pas, À rappeler, En cours, Client MyKeyz…), une catégorie (+ option dépendante), une source, un agent assigné.
- Recherche acheteur : critères d'un contact (villes, quartiers, type de bien, pièces, budget, équipements). C'est le cœur du métier : elle sert au matching contact ⇄ biens dans les deux sens.
- Bien (propriete) : mandat de vente ou location, avec référence (ex. MKV-929), type, option, état, statut (Disponible / Non disponible), propriétaire (contact), éventuellement lot d'un projet neuf.
- Projet : programme neuf (promoteur, statut de commercialisation, lots = biens).
- RDV (agenda) : agenda personnel de l'utilisateur, rattachable à un contact ou un bien.
- Notes : commentaires datés et signés sur un contact.

JOINTURES (important)
- L'API ne stocke que des ids de référentiels et ne fait aucune jointure. CE serveur les fait pour toi :
  - en sortie, chaque champ de référentiel est un objet { id, label } ;
  - en entrée, tout paramètre de référentiel accepte l'id OU le libellé (ex. statut: "NRP", agent: "David", villes: ["Ramat Gan"]). En cas d'erreur, le message liste les valeurs valides : corrige et réessaie.
- N'invente jamais d'id. list_referentials sert à afficher ou expliquer les valeurs, pas à préparer une écriture.

BONNES PRATIQUES
- « Mes contacts », « mon agenda » : le périmètre est celui de l'utilisateur connecté (whoami).
- Avant de créer un contact, cherche s'il existe (list_contacts avec telephone ou texte) ; l'API refuse les doublons de téléphone.
- Pour un acheteur : get_contact → recherches → find_matching_proprietes. Pour un bien : find_buyers.
- Les mises à jour (update_*) ne modifient que les champs fournis.
- Les suppressions sont irréversibles : demande confirmation à l'utilisateur.
- Listes paginées : si page_suivante est présent, il y a d'autres résultats.
`.trim();
