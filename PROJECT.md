# MyKeyzMCP — PROJECT.md

> Document de référence **autonome** du serveur MCP MyKeyz.
> Dernière mise à jour : 14/10/2026 (v0.2.0).

---

## 1. Rôle

Serveur **MCP** (Model Context Protocol) qui donne à un agent IA (Claude via connecteur claude.ai, Claude Desktop, bot WhatsApp…) l'accès au **CRM MyKeyz** : agence immobilière israélienne (Tel Aviv, Ramat Gan…).

Il ne possède **aucune donnée** ni base : c'est une couche de traduction au-dessus de l'API PHP existante `https://api.mykeyz.jg.app`. Sa valeur ajoutée est de **faire les jointures** que le back ne fait pas et d'exposer un vocabulaire métier.

## 2. Écosystème MyKeyz

| Brique | Emplacement | Rôle |
|---|---|---|
| Back (API) | `https://api.mykeyz.jg.app` — miroir FTP local `/root/mykeyz-backend` (pas de git) | PHP 7.2 + Phalcon Micro + MongoDB. **Ne pas modifier depuis ce projet.** |
| Front CRM | `/root/CRMMyKeyzV2` (Vue 2 + BootstrapVue) | **Source de vérité des jointures** objets ↔ Param |
| Base | MongoDB `mykeyz-v2` (copie locale Mongo 27020) | Données réelles — analyse uniquement |
| MCP | `/root/MyKeyzMCP` — github.com/gafsou20/MyKeyzMCP · `main` | Ce projet |

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

## 6. Outils (32)

| Domaine | Outils |
|---|---|
| Session / référentiels | `whoami`, `list_referentials` |
| Contacts | `list_contacts` (texte, téléphone, statut, catégorie, source, agent, important, dates création/modif, tri), `get_contact` (fiche + recherches + biens + projets + RDV + notes), `create_contact`, `update_contact`, `set_contact_status` (+ note), `add_contact_note` |
| Recherches acheteur | `create_search`, `update_search`, `find_matching_proprietes` (contact → biens), `find_buyers` (bien → contacts) |
| Biens | `list_proprietes` (mêmes critères qu'une recherche + référence, statut, agent, annonces scrapées), `get_propriete`, `create_propriete`, `update_propriete` |
| Agenda | `list_agenda` (période, catégorie, fiche liée), `search_agenda`, `create_event`, `update_event`, `delete_event` |
| Projets | `list_projets`, `get_projet` (+ lots), `create_projet`, `update_projet` |
| GED | `list_ged`, `ged_upload`, `ged_delete` |
| IA | `generate_seo` |
| Transactions | `list_transactions`, `get_transaction`, `create_transaction` — **hors périmètre, non retravaillés** (ancien format de sortie) |

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

## 8. Pièges connus

1. **Mises à jour partielles dangereuses côté back** : `/contact/create` réécrit `old_user` à partir de la requête → toujours envoyer la **fiche complète fusionnée** (fait par `update_contact`). Idem biens, RDV (`data` remplacé en bloc), recherches (`data` remplacé), projets.
2. **Création de contact** : l'API force l'agent = créateur → `create_contact` réassigne ensuite si un agent est demandé. Doublon de téléphone (8 derniers chiffres) refusé avec l'id existant.
3. **Projets** : `/projet/create` (ré)enregistre aussi le contact promoteur → toujours lui renvoyer le contact complet. Projet sans contact accessible = modification refusée (sinon création d'un contact vide).
4. **Recherches acheteur** : seules les clés du format API sont valides ; toute autre clé est ignorée silencieusement et la recherche ne matche jamais. Cas réel : **recherche #1533** (contact 2147, 27/07/2026) créée par l'ancienne version du MCP avec `{ville, pieces_min, pieces_max, budget_max}` — **à corriger en prod** (`update_search` purge les clés hors format).
5. **Regex** : les filtres texte sont des `$regex` → échapper (`+` des téléphones, parenthèses…).
6. **Villes** : une même ville peut exister sous deux graphies (« Tel Aviv-Yafo » / « תל אביב-יפו ») → un critère sur l'une ne trouve pas l'autre.
7. **`_id` Mongo** renvoyé sous forme `{ $oid }` → aplati par `core/normalize.ts` et retiré avant renvoi à l'API.
8. **Agenda** : `env_id` non posé par l'API à la création (comportement back, sans impact).
9. Le cache des référentiels dure 10 min : une valeur ajoutée dans le CRM peut mettre ce délai à apparaître.

## 9. Tests

Pas de suite automatisée. Méthode utilisée pour la v0.2.0 :
- fixture `/param/all` reconstituée depuis la base locale `mykeyz-v2` → tests de résolution et de conversion des critères ;
- émulation de `DataQuery::setFilters` directement sur Mongo pour valider la sémantique des filtres ;
- fausse API Express (fixtures de la base locale) + client MCP HTTP pour valider les outils de bout en bout.

Non validé contre la vraie API : écritures réelles (faute de compte de test).

## 10. Déploiement

- Déployé par **Jessy** sur son Plesk : https://mcp.mykeyz.jg.app (`/health`).
- Prod : `npm install --include=dev && npm run build` puis `node dist/http.js` (Passenger ou pm2 + reverse proxy avec `HOST=127.0.0.1`).
- ⚠️ Au 14/10/2026 : `/health` → `oauth:false` — renseigner `OAUTH_JWT_SECRET` (et `PUBLIC_URL`) pour activer le connecteur claude.ai.

## 11. Reste à faire

- Déployer la v0.2.0 et activer l'OAuth.
- Tester les écritures contre la vraie API avec un compte de test.
- Corriger la recherche #1533 en prod.
- Retravailler les transactions (quand ce sera dans le périmètre).
- Alléger la liste des outils (~48 000 caractères, surtout les schémas de sortie des transactions).
- Ajouter une suite de tests automatisée (fixtures anonymisées).

## 12. Historique

| Date | Version | Fait |
|---|---|---|
| 14-15/06/2026 | 0.1.0 | Scaffold stdio, HTTP stateless multi-utilisateur, outils lecture/écriture, pont OAuth, schémas de sortie |
| 27/07/2026 | 0.1.0 | Login avec `plateform: "MCP"` |
| 14/10/2026 | 0.2.0 | Refonte orientée métier : instructions, glossaire, résolution id/libellé, sorties `{id,label}`, filtres complets, recherches strictes, matching bidirectionnel, mises à jour par fusion, `whoami`, cartographie `docs/JOINTURES.md` |
