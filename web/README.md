# FAST N°1 — application HTML / Android partagée

Le dépôt contient **déjà** l'application Android dans `app/`. Cette extension fournit une application HTML créée à partir **des mêmes fichiers** `app/src/main/assets`, pour éviter deux interfaces divergentes.

## Construire et vérifier

À la racine du dépôt, avec Node.js 22 ou plus :

```bash
node web/build.mjs
node web/smoke.mjs
```

Servir `web/dist` sur une URL HTTPS (géolocalisation et appels API) ; ne pas lancer l'interface via `file://`.

## Configuration

Le générateur reprend la clé **publique** `sb_publishable_...` de Gradle. Variables de remplacement facultatives : `FAST_SUPABASE_PUBLISHABLE_KEY` (publiable seulement), `FAST_SUPABASE_URL`, `FAST_API_URL`. Ne jamais fournir une clé `service_role`, une clé privée ou une clé APK.

`web-bridge.js` fournit seulement `FastNative.config()` dans le navigateur, sans recréer les méthodes natives privilégiées d'Android.

## Prévisualisation Vercel — aucune publication automatique

Utiliser un projet Vercel HTML **distinct** des projets admin et API. Avec Root Directory = `web`, activer « Include source files outside of the Root Directory » pour rendre disponibles les assets Android frères, puis build = `node build.mjs` et output = `dist` (voir `web/vercel.json`). Autre choix : Root Directory = racine, Build = `node web/build.mjs`, Output Directory = `web/dist`.

## Préservation de l'existant

L'inscription, la connexion, la carte, la réservation, le parcours chauffeur et la saisie PIN réutilisent les scripts Android existants. Aucun changement de base de données, sécurité RLS, métier, paiement, signature APK, package Android ou service FAST existant.

## Vérifications avant mise en production

`node web/smoke.mjs` valide les fichiers, les références HTML, les écrans et la syntaxe JS. Il ne remplace pas des tests E2E réels. En HTTPS avec des comptes de recette, tester inscription, connexion, géolocalisation, adresse, devis, création de course, dispatch, PIN, redémarrage, fin de course, CORS, RLS, permissions et paiements sandbox. Certaines fonctions Android natives ne seront pas disponibles dans un navigateur et ont des fallbacks limités. Aucune fusion ni déploiement sans autorisation et validation.
