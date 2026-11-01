# MyKeyzMCP — PROJECT.md

> Document de référence **autonome** du serveur MCP MyKeyz.
> Dernière mise à jour : 01/11/2026 (v0.5.0 — pièces jointes ChatGPT + liens de dépôt stables).

---

## 1. Rôle

Serveur **MCP** (Model Context Protocol) qui donne à un agent IA (Claude via connecteur claude.ai, Claude Desktop, bot WhatsApp…) l'accès au **CRM MyKeyz** : agence immobilière israélienne (Tel Aviv, Ramat Gan…).

Il ne possède **aucune donnée** ni base : c'est une couche de traduction au-dessus de l'API PHP existante `https://api.mykeyz.jg.app`. Sa valeur ajoutée est de **faire les jointures** que le back ne fait pas et d'exposer un vocabulaire métier.

## 2. Écosystème MyKeyz

| Brique | Emplacement | Rôle |
|---|---|---|
| Back (API) | `https://api.mykeyz.jg.app` — miroir git `/root/api.mykeyz.jg.app` (github.com/gafsou20/api.mykeyz.jg.app, privé, `./deploy.sh`, creds `.env.local`) | PHP 7.2 + Phalcon Micro + MongoDB. **Règle (Jessy, 14/10/2026) : ne jamais modifier l'existant ; ajouts autorisés uniquement via NOUVEAUX controller + router** (`php -l` 7.2 avant upload). |
| Front CRM | `/root/CRMMyKeyzV2` (Vue 2 + BootstrapVue) | **Source de vérité des jointures** objets ↔ Param |
| Base | MongoDB `mykeyz-v2` (copie locale Mongo 27020) | Données réelles — analyse uniquement |
| MCP | `/root/MyKeyzMCP` — github.com/gafsou20/MyKeyzMCP · `main` | Ce projet |

### Relations entre les briques

```
  CRMMyKeyzV2 (front web)          MyKeyzMCP (ce projet)
  /root/CRMMyKeyzV2                /root/MyKeyzMCP
  Vue 2 · utilisé par les agents   Node/TS · utilisé par l'agent IA
            │  HTTP + token               │  HTTP + token (plateform "MCP")
            └──────────────┬──────────────┘
                           ▼
            API PHP  https://api.mykeyz.jg.app
            miroir git : /root/api.mykeyz.jg.app
            (routes/*.php → controllers/*.php → models/*.php)
                           │  connexion "mongo"
                           ▼
            MongoDB  base `mykeyz-v2`
            (prod sur l'hébergement du back ;
             copie locale sur ce serveur : Mongo Docker 27020, base `mykeyz-v2`)
```

- **CRMMyKeyzV2 et MyKeyzMCP sont deux clients du MÊME back** : mêmes routes, même authentification (`POST /authorization/create` → token dans `Authorization`), mêmes droits. Le front envoie `plateform` absent (= Web, session 24 h), le MCP envoie `plateform: "MCP"` (session 60 j) ; les deux sessions coexistent.
- **Ni le front ni le MCP n'accèdent à MongoDB directement** : tout passe par l'API. La base locale `mykeyz-v2` ne sert qu'à l'analyse et aux tests (émulation des requêtes).
- **Le back est la seule source des données ; le front est la seule source des jointures** : les correspondances champ → référentiel (`contact.status_id` → `Param[ContactStatus]`) ne sont écrites que dans CRMMyKeyzV2 (`$api.p(...)`, `$api.params.X`) et la collection `model`. Le MCP les a reprises dans `docs/JOINTURES.md` et `src/domain/`.
- **Routes du back propres au MCP** : `routes/mcp.php` + `controllers/McpController.php` (§7 bis), lecture seule, non utilisées par le front.
- Correspondance des noms : dossier back `/root/api.mykeyz.jg.app` = API `api.mykeyz.jg.app` = connexion Phalcon `mongo` = base **`mykeyz-v2`** (la connexion `old` pointe une ancienne base `mykeyz`, inutilisée ; `pbx` = PostgreSQL téléphonie, inutilisée par les contrôleurs actuels).
- ⚠️ `/root/MyKeyzCRM` (Ionic Vue 3) et `/root/MyKeyzCRM-api-src` (ancienne copie du back, juin 2026) **ne font pas partie de l'écosystème actif** : ne pas s'y fier.

Multi-marque : `env_id` 1 = MyKeyz, 2 = SelecSion. Le back filtre sur le `current_env` de l'utilisateur ; **le MCP ne gère pas l'env** (décision du 14/10/2026).

## 3. Stack & commandes

- Node ≥ 20 · TypeScript strict (ESM, NodeNext) · `@modelcontextprotocol/sdk` 1.29 · Express · Zod · jose (OAuth JWE).

| Commande | Effet |
|---|---|
| `npm run dev:http` | serveur HTTP en watch (tsx) |
| `npm run build` | compile `src/` → `dist/` |
| `npm run serve` | prod HTTP : `node dist/http.js` |
| `npm run serve:stdio` / `npm start` | entrée stdio (Claude Desktop local) |
| `npm run typecheck` | vérification TS |

Installation : `npm install --include=dev` (l'hôte force `omit=dev`).

### Variables d'environnement
| Variable | Usage |
|---|---|
| `MYKEYZ_API_URL` | base API (défaut `https://api.mykeyz.jg.app`) |
| `PORT` / `HOST` | écoute HTTP (`PORT` peut être un socket Passenger) |
| `OAUTH_JWT_SECRET` | **obligatoire en prod** pour activer l'OAuth (sinon `/health` → `oauth:false`, connecteur claude.ai inutilisable) |
| `PUBLIC_URL` | URL publique (métadonnées OAuth), sinon déduite des en-têtes `X-Forwarded-*` |
| `MYKEYZ_TOKEN` | stdio uniquement (mono-poste) |

## 4. Architecture

```
src/
  http.ts            entrée HTTP : POST /mcp (stateless), /health, routes OAuth
  index.ts           entrée stdio
  server.ts          crée le McpServer (+ instructions) et enregistre les outils
  instructions.ts    consignes globales envoyées au client (modèle mental MyKeyz)
  auth/              oauth.ts (pont OAuth 2.1 PKCE → login MyKeyz), crypto.ts (JWE)
  api/               un fichier par ressource API (appels HTTP bruts)
  core/
    client.ts        fetch + déballage {status,data} + normalisation Mongo
    context.ts       token par requête (AsyncLocalStorage) — multi-utilisateur
    referentials.ts  cache /param/all (10 min, 200 sessions max) + résolution id ⇄ libellé
    dates.ts         epoch ⇄ dates Asia/Jerusalem
    text.ts          normalisation, échappement regex, conversion nombres
    errors.ts        ToolError + traduction des erreurs API en messages actionnables
  domain/
    glossary.ts      libellés FR + définitions + alias des valeurs de référentiels
    joins.ts         référentiel → champs qui l'utilisent
    criteria.ts      critères de recherche métier ⇄ format API strict
    present.ts       projections lisibles des objets ({id,label}, dates, nombres)
  tools/             un fichier par domaine (contacts, searches, proprietes, agenda, projets, ged, referentials, ai, transactions)
    run.ts           enveloppe commune : charge les référentiels, exécute, erreurs propres
    schemas.ts       schémas d'entrée partagés (refValue, critères, adresse…)
docs/JOINTURES.md    cartographie complète des jointures (référence métier)
```

### Authentification
- **Login** : `POST /authorization/create` avec `plateform: "MCP"` → session MyKeyz de **60 jours**. Côté back (modif du 14/10/2026), une connexion Web (24 h) ne coupe plus la session MCP et inversement.
- **OAuth** (claude.ai) : `/authorize` affiche le login MyKeyz, `/token` émet un access JWE (8 h) + refresh (30 j) qui encapsulent le token MyKeyz. Sans état côté serveur.
- **Token brut** accepté aussi dans `Authorization` (bot, Claude Desktop).
- Chaque requête `/mcp` crée un serveur éphémère dans le contexte du token de l'appelant : aucune fuite entre utilisateurs.

## 5. Principe clé : les jointures

Le back ne stocke que des **ids** de référentiels (`contact.status_id` = `Param[ContactStatus].id`, etc.) et ne fait **aucune** jointure. Les correspondances sont décrites dans le front CRMMyKeyzV2 et la collection `model` → consignées dans **`docs/JOINTURES.md`**.

Le MCP les applique :
- **Entrée** : tout paramètre de référentiel accepte un **id ou un libellé** (`"NRP"`, `"nrp"`, `3`, `"3"`, alias « ne répond pas », nom d'agent, ville partielle « Tel Aviv » → « Tel Aviv-Yafo »). Résolution insensible aux accents/casse, avec gestion des référentiels **dépendants** (option de catégorie ← catégorie, option de bien ← type de bien). Échec ou ambiguïté → erreur listant les valeurs valides.
- **Sortie** : chaque jointure est un objet `{ id, label }` ; dates `YYYY-MM-DD HH:mm` heure d'Israël ; nombres stockés en texte convertis.
- **Glossaire** (`domain/glossary.ts`) : libellés lisibles + définitions (NRP, Meshavek…), indexés par **clé technique** (`titre`) et non par id.

Validations de Jessy (14/10/2026) : statut de projet = **ProjetStatus** (la collection `model` qui dit ProprieteStatus est fausse) ; `projet.permis` = **ProjetPermis** (ancien booléen obsolète) ; `etage`/`superficie`/`parking_place` = nombres.

## 6. Outils (35)

| Domaine | Outils |
|---|---|
| Session / référentiels | `whoami`, `list_referentials` |
| Contacts | `list_contacts` (texte, téléphone, statut, catégorie, source, agent, important, dates création/modif, tri), `get_contact` (fiche + recherches + biens + projets + RDV + notes), `create_contact`, `update_contact`, `set_contact_status` (+ note), `add_contact_note` |
| Recherches acheteur | `list_searches`, `search_stats` (tout le périmètre), `create_search`, `update_search`, `find_matching_proprietes` (contact → biens), `find_buyers` (bien → contacts) |
| Biens | `list_proprietes` (mêmes critères qu'une recherche + référence, statut, agent, annonces scrapées), `get_propriete`, `create_propriete`, `update_propriete` |
| Agenda | `list_agenda` (période, catégorie, fiche liée), `search_agenda`, `create_event`, `update_event`, `delete_event` |
| Projets | `list_projets`, `get_projet` (+ lots), `create_projet`, `update_projet` |
| GED | `list_ged`, `ged_lien_depot` (lien temporaire de dépôt — § 6 bis), `ged_upload` (`file_url` https ou base64), `ged_delete` |
| IA | `generate_seo` |
| Transactions | `list_transactions`, `get_transaction`, `create_transaction` — **hors périmètre, non retravaillés** (ancien format de sortie) |

## 6 bis. Ajout de photos / documents (v0.4.0, 25/10/2026)

**Constat (Jessy)** : impossible d'ajouter des photos depuis le chat. Deux causes :
1. **Conception** : `ged_upload` attendait le fichier **en base64 dans un paramètre**. Or un client MCP (claude.ai, ChatGPT)
   ne donne pas à l'IA les octets d'une pièce jointe, et une photo de 3 Mo ferait ~4 millions de caractères : l'upload
   depuis une conversation était impossible quel que soit le client.
2. **Bug** : `GedController::base64ToFile` (back) garde `explode(',', …)[1]` → du base64 **brut** (sans `data:…;base64,`)
   écrivait un **fichier vide**, avec fiche GED créée et réponse « succès ». Le CRM n'est pas touché (il envoie une data URL).

**Solution (MCP seul, back inchangé)** :
- `core/files.ts` : `toDataUrl()` — tout contenu part au back en data URL (type MIME par l'extension), base64 validé,
  20 Mo max ; `fetchAsDataUrl()` — téléchargement **https uniquement**, IP privées / locales refusées (SSRF), pas de
  redirection, 30 s, 20 Mo.
- `ged_upload` : `file_url` (le MCP télécharge) **ou** `file` (base64 / data URL, `file_name` obligatoire).
- **`ged_lien_depot`** : renvoie `…/depot/<jeton>` valable **30 min**. Jeton = JWE (A256GCM) contenant le **token MyKeyz
  chiffré**, la fiche (Propriete / Projet + id) et le type GED → opaque, infalsifiable, limité à une fiche. Page
  `src/depot.ts` (mobile d'abord, plusieurs fichiers, glisser-déposer, statut par fichier ; photos JPEG / PNG / WebP
  > 2560 px ou > 4 Mo réduites dans le navigateur en JPEG 85 %) ; `POST /depot/<jeton>` → `/ged/upload` avec le token
  de l'utilisateur. En-têtes `no-referrer`, `noindex`, `no-store`. Routeur monté **avant** le `express.json` global (5 Mo).
- Clé des jetons : `DEPOT_SECRET`, sinon `OAUTH_JWT_SECRET`, sinon **aléatoire par processus** (jamais la clé de repli
  connue de `crypto.ts`, le lien transportant un token d'accès). URL publique : `PUBLIC_URL`, sinon en-têtes
  `X-Forwarded-*` (passés aux outils via `RequestContext.baseUrl`).
- Instructions de l'agent : pièces jointes → `ged_lien_depot`, puis `list_ged` pour vérifier.

## 7. Correspondances API utiles

| Besoin | Appel API | Remarque |
|---|---|---|
| Référentiels | `GET /param/all` | `User` limité aux agents visibles ; `ContactCommentaireAgent` = tous + « Ancien agent » (id 0) ; `Ville` = villes distinctes des biens (id = nom) |
| Profil | `GET /authorization/verify` | |
| Listes | `POST /<x>/liste` `{filters, sort:{key,value}, limit, page}` | `DataQuery::setFilters` : string → regex insensible (**échapper**), tableau → `$in` (vide = ignoré), `min_X`/`max_X` → `X >= / <=`, nombre/booléen → égalité, null → ignoré |
| Biens | `POST /propriete/listev2` | vue `viewPropriete` (mandats + annonces) ; `origine_id: [0]` = mandats seuls |
| Matching contact → biens | `POST /propriete/listev2` avec `filters = contact_search.data` | |
| Matching bien → contacts | `GET /propriete/{id}` → `searchs` | `Propriete::getSearchs()` |
| Agenda | `POST /agenda/liste` | uniquement les RDV de l'utilisateur, **pas de pagination serveur** ; filtre période via `min_data.time`/`max_data.time` (epoch 00:00 **UTC**) |
| Écritures | `POST /<x>/create` | création **ou** mise à jour si `id` |

## 7 bis. Routes back dédiées au MCP (ajoutées le 14/10/2026)

Nouveaux fichiers, lecture seule, sans impact sur l'existant : `routes/mcp.php` + `controllers/McpController.php` (en prod sur api.mykeyz.jg.app, copie dans `/root/api.mykeyz.jg.app`).

| Route | Rôle | Outil MCP |
|---|---|---|
| `POST /mcp/search/liste` | recherches acheteur de **tout le périmètre** (env courant + contacts des agents visibles, `old_user` pour le rôle 3), contact embarqué, filtres `status_id`, `villes`, `quartier_id`, `transaction_id`, `bien_id`, `contact_id`, `contact_user_id`, `prix`, `pieces`, `superficie`, `min/max_date_create`, `inclure_indifferent` | `list_searches` |
| `POST /mcp/search/stats` | mêmes filtres → total + répartition par ville / transaction / statut | `search_stats` |
| `GET /mcp/propriete/{id}/buyers?actives=1` | matching bien → acheteurs = logique de `Propriete::getSearchs()` mais **tolérante aux recherches incomplètes** et limitée au périmètre, contact embarqué | `find_buyers`, compteur de `get_propriete` |

`inclure_indifferent` (défaut true) : une recherche sans critère sur la ville / transaction / type (tableau vide = accepte tout) est comptée.

## 8. Pièges connus

1. **Mises à jour partielles dangereuses côté back** : `/contact/create` réécrit `old_user` à partir de la requête → toujours envoyer la **fiche complète fusionnée** (fait par `update_contact`). Idem biens, RDV (`data` remplacé en bloc), recherches (`data` remplacé), projets.
2. **Création de contact** : l'API force l'agent = créateur → `create_contact` réassigne ensuite si un agent est demandé. Doublon de téléphone (8 derniers chiffres) refusé avec l'id existant.
3. **Projets** : `/projet/create` (ré)enregistre aussi le contact promoteur → toujours lui renvoyer le contact complet. Projet sans contact accessible = modification refusée (sinon création d'un contact vide).
4. **Recherches acheteur** : seules les clés du format API sont valides. Cas réel : **recherche #1533** (contact 2147, 27/07/2026) créée par l'ancienne version du MCP avec `{ville, pieces_min, pieces_max, budget_max}`. Conséquence grave : sans `data.transaction_id`, l'agrégation de `Propriete::getSearchs()` lève « $in requires an array », erreur **avalée** par `DataQuery::runQuery` → **0 acheteur potentiel sur TOUS les biens, dans le CRM comme dans le MCP, depuis le 27/07**. Correctif donné à Jessy (update Mongo de `data` en prod). La route `/mcp/propriete/{id}/buyers` est insensible à ce cas.
5. **Regex** : les filtres texte sont des `$regex` → échapper (`+` des téléphones, parenthèses…).
6. **Villes** : une même ville existe sous plusieurs graphies (« Tel Aviv-Yafo », « Tel Aviv-Jaffa », « תל אביב-יפו »). En lecture (list_proprietes, find_matching_proprietes, list_searches, search_stats), le MCP étend aux graphies connues (`VILLE_ALIASES` dans `tools/searches.ts`). En écriture, on stocke la graphie du référentiel.
10. **Clients MCP (ChatGPT…)** : ils mettent la liste des outils en cache ; après un déploiement qui change les schémas, **actualiser / reconnecter le connecteur**, sinon le client envoie les anciens paramètres (ex. `categorie_id` au lieu de `categorie`).
7. **`_id` Mongo** renvoyé sous forme `{ $oid }` → aplati par `core/normalize.ts` et retiré avant renvoi à l'API.
8. **Agenda** : `env_id` non posé par l'API à la création (comportement back, sans impact).
9. Le cache des référentiels dure 10 min : une valeur ajoutée dans le CRM peut mettre ce délai à apparaître.
11. **Fichiers** : ChatGPT peut transmettre une pièce jointe à un outil qui déclare `_meta["openai/fileParams"]` (`ged_ajouter_fichier`, v0.5.0 ; à confirmer en réel : des développeurs signalaient que les pièces jointes du chat n'arrivaient pas) ; sinon lien de dépôt. Le back
    n'accepte qu'une **data URL** (base64 brut = fichier vide enregistré sans erreur) : toujours passer par `toDataUrl()`.
12. **Liens de dépôt sans `DEPOT_SECRET`** : avant v0.5.0, clé propre à chaque processus → « Lien expiré » dès l'ouverture (Plesk / Passenger lance et recycle plusieurs processus ; c'était le cas en prod, sans `DEPOT_SECRET` ni `OAUTH_JWT_SECRET`). Depuis v0.5.0 : repli sur une clé créée une fois dans `.depot-secret` (racine, 600, hors git ; `DEPOT_KEY_FILE` pour changer) → même clé pour tous les processus et après redémarrage. `DEPOT_SECRET` reste prioritaire.

## 9. Tests

Pas de suite automatisée. Méthode utilisée (v0.2.0 et v0.3.0) :
- fixture `/param/all` reconstituée depuis la base locale `mykeyz-v2` → tests de résolution et de conversion des critères ;
- émulation de `DataQuery::setFilters`, de `Propriete::getSearchs()` et des pipelines de `McpController` directement sur Mongo (ex. 221 recherches en cours sur Tel Aviv ; ADL-2223 → 11 acheteurs, MKV-2214 → 24) ;
- fausse API Express (fixtures de la base locale) + client MCP HTTP pour valider les outils de bout en bout.
- v0.4.0 (25/10/2026) : fausse API + client MCP + Playwright — base64 brut → data URL, data URL, base64 invalide refusé,
  `file_url` https OK, IP privée et http refusés, lien de dépôt → page → 2 fichiers (PNG + PDF) envoyés avec la bonne
  fiche, le bon type et le token de l'utilisateur, jeton altéré → 410.

Non validé contre la vraie API : écritures réelles (faute de compte de test).

## 10. Déploiement

- Déployé par **Jessy** sur son Plesk : https://mcp.mykeyz.jg.app (`/health`).
- Prod : `npm install --include=dev && npm run build` puis `node dist/http.js` (Passenger ou pm2 + reverse proxy avec `HOST=127.0.0.1`).
- ⚠️ Au 14/10/2026 : `/health` → `oauth:false` — renseigner `OAUTH_JWT_SECRET` (et `PUBLIC_URL`) pour activer le connecteur claude.ai.
- v0.4.0 : ajouter **`DEPOT_SECRET`** (chaîne aléatoire longue) et idéalement **`PUBLIC_URL=https://mcp.mykeyz.jg.app`**.
  Vérifier que le proxy Plesk accepte des requêtes de ~30 Mo sur `/depot/*` (photos), sinon les gros fichiers échouent.

## 11. Reste à faire

- Déployer la v0.4.0 (Jessy) avec `DEPOT_SECRET` + `PUBLIC_URL`, et activer l'OAuth (`OAUTH_JWT_SECRET`).
- Tester le lien de dépôt contre la vraie API (1 photo sur un bien de test), et la taille max acceptée par le back PHP (`post_max_size`).
- Actualiser / reconnecter le connecteur dans ChatGPT après déploiement (cache des schémas d'outils).
- Valider les routes `/mcp/*` du back avec un vrai token (testées seulement via émulation Mongo).
- Tester les écritures contre la vraie API avec un compte de test.
- Corriger la recherche #1533 en prod (casse le matching bien → acheteurs du CRM).
- Retravailler les transactions (quand ce sera dans le périmètre).
- Alléger la liste des outils (~48 000 caractères, surtout les schémas de sortie des transactions).
- Ajouter une suite de tests automatisée (fixtures anonymisées).

## 12. Historique

| Date | Version | Fait |
|---|---|---|
| 14-15/06/2026 | 0.1.0 | Scaffold stdio, HTTP stateless multi-utilisateur, outils lecture/écriture, pont OAuth, schémas de sortie |
| 27/07/2026 | 0.1.0 | Login avec `plateform: "MCP"` |
| 14/10/2026 | 0.2.0 | Refonte orientée métier : instructions, glossaire, résolution id/libellé, sorties `{id,label}`, filtres complets, recherches strictes, matching bidirectionnel, mises à jour par fusion, `whoami`, cartographie `docs/JOINTURES.md` |
| 14/10/2026 | 0.3.0 | Routes back `/mcp/*` (nouveaux fichiers) + `list_searches`, `search_stats`, `find_buyers` robuste, graphies de villes, compteur d'acheteurs fiable |
| 01/11/2026 | 0.5.0 | `ged_ajouter_fichier` : pièce jointe de la conversation via `_meta["openai/fileParams"]` (ChatGPT passe `{download_url, file_id, mime_type?, file_name?}`) ; liens de dépôt stables (clé `.depot-secret`) ; téléchargements : redirections suivies et revalidées (https, hôte public), User-Agent |
| 01/11/2026 (soir) | 0.5.0 | **Déployé par Jessy** ; envoi d'une photo jointe dans ChatGPT → GED **validé en réel par Jessy**. Commit suivant `9b63fb1` (`/health` affiche `version` et `depot_cle_stable`, version annoncée lue dans package.json) **pas encore déployé** |
| 25/10/2026 | 0.4.0 | Ajout de photos / documents : `ged_lien_depot` (page de dépôt temporaire), `ged_upload` par `file_url`, data URL forcée (corrige les fichiers vides du base64 brut) |

---

## Fiche synthèse (reprise de PROJECTS.md, 27/10/2026)

> Résumé qui figurait dans l'inventaire des projets d'Alfred, recopié ici pour ne rien perdre. En cas d'écart avec le reste de ce document, c'est le reste du document qui fait foi.

| Champ | Valeur |
|---|---|
| **Description** | Serveur **MCP** du CRM MyKeyz (agence immo Tel Aviv / Ramat Gan) : donne à Claude l'accès aux contacts, recherches acheteur, biens, agenda, projets, GED. **Fait les jointures objets ↔ Param** que le back ne fait pas (entrée id OU libellé, sortie `{id,label}`), matching contact ⇄ biens dans les deux sens. |
| **Stack** | Node 20 + TS strict + `@modelcontextprotocol/sdk` 1.29 + Express + Zod · OAuth 2.1 PKCE (JWE) vers le login MyKeyz |
| **Statut** | 🟡 v0.3.0 poussée le 14/10/2026 — **déploiement par Jessy** (Plesk) sur https://mcp.mykeyz.jg.app · OAuth off en prod (`OAUTH_JWT_SECRET` manquant) · ChatGPT : actualiser le connecteur après chaque déploiement |
| **Repo** | `/root/MyKeyzMCP` — github.com/gafsou20/MyKeyzMCP · `main` |
| **Écosystème** | Back PHP 7.2/Phalcon `api.mykeyz.jg.app` (miroir FTP `/root/api.mykeyz.jg.app`, creds `.env.local`, **jamais modifier l'existant : ajouts via nouveaux controller + router uniquement** — `routes/mcp.php` + `McpController.php` en prod depuis le 14/10) · front de référence **`/root/CRMMyKeyzV2`** (Vue 2) — ⚠️ `/root/MyKeyzCRM` n'est PAS le bon front · base locale `mykeyz-v2` (Mongo 27020) |
| **⚠️ Bug prod** | Recherche #1533 (créée par l'ancien MCP, sans `transaction_id`) → `Propriete::getSearchs()` renvoie 0 acheteur sur tous les biens du CRM depuis le 27/07 ; correctif Mongo transmis à Jessy |
| **📖 Détails** | **Voir `/root/MyKeyzMCP/PROJECT.md`** + `docs/JOINTURES.md` (cartographie des jointures validée par Jessy) |
| **Créé / MAJ** | 06/2026 · MAJ 14/10/2026 |
