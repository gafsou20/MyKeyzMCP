# MyKeyz — Cartographie des jointures (objets ↔ Param)

> Source de vérité : le front **CRMMyKeyzV2** (`$api.p(Model, id)`, `$api.params.X`) et la
> collection **`model`** (dictionnaire de champs lu par `FieldForm.vue`).
> Le back n'a **aucune liaison** : il stocke des ids et ne fait pas de jointure (sauf `user`).
> Référentiels livrés par `GET /param/all` → `params[<Model>]` = tableau d'objets `{ id, titre, … }`.
> Vérifié sur la base `mykeyz-v2` le 14/10/2026.

## 0. Règles générales

- **Libellé** = `titre` (clé snake_case, à traduire via `lang.json` du front : `$api.w(titre)`).
  Certains référentiels ont `titre_fr/he/en` (Propriete*) ou `site.{fr,en,he}` (Projet*, Ville).
- **Couleur** = `color` (badge bootstrap : primary, danger, success, warning, info).
- **Ids entiers** partout, **sauf** `Ville` (id = nom de la ville, texte).
- **Dates** : `date_create` / `date_update` = epoch **secondes**. Agenda `data.date` = `YYYY-MM-DD`, `data.heure` = `HH:MM`.
- **Soft delete** : `status = 1` actif (≠ `status_id`, qui est le statut métier).
- **Rattachement polymorphe** : `model` (`"Contact"` | `"Propriete"` | `"Projet"`) + `model_id`.

## 1. Contact (`contact`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `status_id` | **ContactStatus** | 1 nouveau_lead · 2 a_rappeler · 3 nrp (ne répond pas) · 4 pas_interesser · 5 errone · 6 client_mykeyz · 7 plus_actualite · 8 doublon · 9 Alyah en cours · 10 Callback Zach · **74** en_cours |
| `source_id` | **ContactSource** | Creation, Facebook, Google, Instagram, YAD 2, Madlan, Site MyKeyz, WhatsApp… |
| `categorie_id` | **ContactCategorie** | 1 client · 2 prestataire · 3 proprietaire · 4 meshavek · 5 promoteur |
| `categorie_option_id` | **ContactCategorieOption** | **dépend de `categorie_id`** (filtrer `option.categorie_id === contact.categorie_id`). Ex. client → achat / location |
| `langue_id` | **Langue** | 1 Français · 2 Hébreu · 3 Anglais (`code` fr/he/en) |
| `user_id` | **User** | agent assigné. ⚠️ `params.User` = seulement les agents visibles par l'utilisateur connecté |
| `old_user[]` | User (ids) | anciens agents ; la liste contacts filtre `user_id` **ou** `old_user` ∈ périmètre |
| `env_id` | Env | marque |
| `socite` | — | société (faute d'orthographe d'origine) |
| `commentaire` | — | **ancien** historique texte (lignes `… | Auteur date`) ≠ collection `contact_commentaire` |

- Écran liste : `/contact/liste/:categorie_id` → la liste est **par catégorie**.
- Formulaire contact standard : catégories **sauf** 4 et 5 ; contact promoteur d'un projet : catégories **4 et 5 uniquement**.

## 2. Commentaire (`contact_commentaire`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `contact_id` | → `contact.id` | |
| `user_id` | **ContactCommentaireAgent** | ≠ `User` : **tous** les utilisateurs + `{id:0, titre:"Ancien agent"}` |
| `txt` | — | texte |

## 3. Recherche acheteur (`contact_search`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `contact_id` | → `contact.id` | |
| `status_id` | **ContactSearchStatus** | 1 en_cours · 2 terminer |
| `nb` | — | nb de biens correspondants (calculé) |
| `uuid` | — | lien public |
| `data` | **= filtres de `POST /propriete/listev2`** | voir ci-dessous |

Structure de `data` (formulaire `Recherche.vue`) :

| Clé | Type | Référentiel |
|---|---|---|
| `adresse.locality` | tableau | **Ville** (id = nom) |
| `adresse.quartier_id` | tableau | **Quartier** |
| `transaction_id` | tableau | **ProprieteTransaction** |
| `bien_id` | tableau | **ProprieteBien** |
| `bien_option_id` | tableau | **ProprieteBienOption** (dépend de `bien_id`) |
| `origine_id` | id | **ScraperSource** |
| `status_id` | id | **ProprieteStatus** |
| `min_/max_prix_vente`, `min_/max_nb_pieces`, `min_/max_superficie`, `min_/max_etage` | nombres | — |
| `terrace`, `parking`, `jardin`, `toit`, `ascenseur`, `meuble`, `cave` | booléen / null | null = indifférent |

- Tableau vide = « tous ».
- ⚠️ Clés **anciennes** encore présentes en base : `ville`, `pieces_min`, `pieces_max`, `budget_max` (à ignorer ou migrer).
- **Matching** : contact → biens = `POST /propriete/listev2` avec `filters = search.data`. Bien → acheteurs = `Propriete::getSearchs()` (transaction, ville, type, option, prix…). Le filtre quartier est commenté côté back.

## 4. Bien (`propriete`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `transaction_id` | **ProprieteTransaction** | 1 achat_vente (Achat) · 2 location |
| `bien_id` | **ProprieteBien** | appartement, maison, local, autre… |
| `bien_option_id` | **ProprieteBienOption** | **dépend de `bien_id`** (standard, penthouse, rdj, duplex…) |
| `etat_id` | **ProprieteEtat** | neuf 1re main, neuf 2de main, rénové… |
| `status_id` | **ProprieteStatus** | 1 disponible · 2 non_disponible |
| `source_id` | **ContactSource** | (selon la collection `model`) |
| `user_id` | **User** | agent |
| `contact_id` | → `contact.id` | propriétaire |
| `projet_id` | → `projet.id` | lot d'un projet |
| `adresse.quartier_id` | **Quartier** | |
| `adresse.locality` | **Ville** | texte |
| `color_id` | **ProprieteColor** | **calculé** par le back (carte) : 1 projet · 2 à vendre · 3 à louer · 0 autre |
| `titre`, `description`, `site` | — | multilingues `{fr,he,en}` |
| `immeuble`, `type_appartement` | — | lots de projet, texte libre (« מגדל 2 », « A ») |

## 5. Annonce scrapée (`scraper`)

Mêmes champs que le bien (`bien_id`, `transaction_id`, `status_id`…). `source_id` / `origine_id` → **ScraperSource** (0 MyKeyz · 1 Batabo — collection `scraper_source`, hors Param).

## 6. Projet (`projet`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `status_id` | **ProjetStatus** | 1 Pré-vente · 2 En commercialisation · 3 Livraison imminente… ⚠️ la collection `model` dit `ProprieteStatus` : **faux**, le front et les données utilisent ProjetStatus |
| `type_id` | **ProjetType** | tour_standing, immeuble_boutique, maison |
| `pre_type_id` | **ProjetPreType** | habitation · commercial |
| `permis` | **ProjetPermis** | 1 obtenu · 2 en cours ⚠️ certaines données en booléen |
| `caracteristique_id[]` | **ProjetCaracteristique** | tableau |
| livraison | **ProjetLivraison** | |
| `user_id` | **User** | |
| `contact_id` | → `contact.id` | promoteur (catégorie 4 ou 5) |
| `adresse.quartier_id` | **Quartier** | |

## 7. Transaction (`transaction`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `type_id` | **TransactionType** | 1 Achat · 2 Vente · 3 Location (proprio) · 4 Location (locataire) |
| `propriete` | objet copié `{id, titre}` | `id` → `propriete.id` |
| `client` | objet copié `{id, nom, prenom, isNew}` | `id` = contact.id **ou UUID** si client créé à la volée |
| `agents[]` | `{id, nom, prenom, commission_ht, tva_percent, isNew}` | `id` = user.id **ou UUID** (agent externe) |
| `montant_ht`, `tva_percent`, `date` | — | |
| (devis) `type_id` | **TransactionQuoteType** | 1 entre · 2 sortie |

## 8. Agenda (`agenda`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `data.categorie_id` | **AgendaCategorie** | 1 client_important · 2 client_relance |
| `model` + `model_id` | Contact / Propriete | rattachement (peut être null) |
| `user_id` | **User** | |
| `data.titre/date/heure/description/telephone/url` | — | |

## 9. GED (`ged`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `type_id` | **GedType** | 1 image · 2 plan · 3 autre · 4 brochure |
| `model` + `model_id` | Propriete / Projet | |

## 10. Utilisateur (`user`)

| Champ | Référentiel | Remarque |
|---|---|---|
| `role_id` | **UserRole** | 1 Admin · 2 Utilisateur · 3 Relanceur |
| `status_id` | **UserStatus** | 1 actif · 2 inactif |
| `env_id[]` / `current_env` | **Env** | 1 MyKeyz · 2 SelecSion |
| `user_id[]` | User | agents dont il voit les données |
| `acl[]` | Acl | droits fins |

## 11. Référentiels hors collection `param`

| Clé `/param/all` | Origine |
|---|---|
| `User` | collection `user`, filtrée par le périmètre de l'utilisateur, `titre` = « Prénom N. » |
| `ContactCommentaireAgent` | tous les users + « Ancien agent » (id 0) |
| `Quartier` | collection `quartier` (`titre` = nom fr) |
| `Ville` | valeurs distinctes de `propriete.adresse.locality` |
| `Env` | environnements de l'utilisateur |
| `Model` | collection `model` (dictionnaire de champs) |
| `ScraperSource` | collection `scraper_source` |

## 12. Incohérences relevées

1. `model.Projet.status_id` pointe vers ProprieteStatus au lieu de ProjetStatus.
2. `projet.permis` mélange id et booléen.
3. `contact_search.data` mélange anciennes et nouvelles clés.
4. `transaction.client.id` / `agents[].id` : id numérique ou UUID.
5. `propriete.etage`, `superficie`, `parking_place` : nombre ou texte selon les fiches.
