# Validation ERP FAST — 12/09/2026

Référence : checklist finale de mise en production ERP FAST.

## Légende
- ✅ vérifié réellement
- ⚠️ partiellement vérifié / code prêt mais test réel restant
- ❌ bloquant avant bascule

## Étape 1 — Débloquer le pipeline Vercel
- ✅ Cause exacte diagnostiquée : le secret GitHub Actions `VERCEL_TOKEN` est absent/vide. Le `VERCEL_ORG_ID` (`team_ikooiav5lkWrGTZIY05wYg0n`) et le `VERCEL_PROJECT_ID` backend (`prj_fFq7tf0gmVRerxi1bYNzloFh8L1l`) sont corrects.
- ✅ Workflow backend durci sur `main` au commit `e471a683d09a19f1801696e09a5400f53e0b857a` : un déploiement production automatique n'est plus autorisé ; le pipeline exige désormais un déploiement Vercel preview puis un contrôle `/health`.
- ❌ Le run GitHub Actions `34689594352` échoue précisément à l'étape `Require Vercel authorization` après syntaxe + tests backend réussis. Aucun déploiement preview n'est donc produit par ce pipeline tant que `VERCEL_TOKEN` n'est pas réellement présent dans les secrets du dépôt.
- ❌ Le déploiement Vercel cible-null `dpl_AM6WD39BnFZBRNEm7QRueoH6gUxp` ne constitue pas une preuve acceptable : son endpoint `/health` retourne HTTP 404. Il n'est pas validé comme preview du backend FAST courant.
- ❌ Le test réel d'un compte `invalidated` / `is_active=false` sur le backend preview n'a donc pas encore pu être effectué.
- ❌ Étape 1 NON VALIDÉE. Interdiction de promotion production.

## 0. Configuration générale
- ✅ Projet Supabase de production identifié : `hmwxwzfcpdvgzjgxruup` — The Fast N°1.
- ❌ Aucune preview Vercel distincte et validée du nouvel ERP n'existe encore ; la parité des variables preview/prod n'est donc pas vérifiée.
- ✅ Migration `erp_fast_core` appliquée sur Supabase production (migration version `20260912101508`).

## 1. Tableau de bord
- ⚠️ Contrôle des données source effectué : 1 client, 1 chauffeur offline, 8 courses toutes annulées, 0 course active, 0 CA de courses terminées, 0 règle de commission. Le rendu réel sur preview reste à vérifier.
- ✅ Le calcul gère une période sans course terminée et renvoie des zéros sans crash dans les tests/build.

## 2. Chauffeurs
- ✅ Recherche, filtres disponibilité/statut admin et tris ajoutés à la page Chauffeurs.
- ✅ Absence de ligne `account_admin_controls` => affichage `pending` et compte considéré actif par défaut.
- ⚠️ Validation/refus individuel des documents implémenté, mais la prod contient actuellement 0 document chauffeur : pas de test réel de persistance possible.
- ✅ Le contrôle administratif utilise `account_admin_controls` et n'écrit jamais dans `drivers.status`.
- ⚠️ Blocage des comptes désactivés/invalidés ajouté et testé unitairement dans le backend, mais pas encore vérifié sur une preview Vercel valide.

## 3. Clients
- ✅ Client sans contrôle administratif => `pending` par défaut.
- ✅ Validation/invalidation, activation/désactivation et motif interne sont implémentés dans `account_admin_controls`.
- ⚠️ Test de persistance réel à effectuer sur preview avant bascule.

## 4. Courses
- ✅ Affichage des statuts existants et historique `ride_events` implémenté.
- ✅ Annulation, réassignation et modification de prix écrivent un événement administratif.
- ⚠️ Les 8 courses réelles actuellement présentes sont toutes annulées ; aucun test réel de réassignation d'une course active ni de terminaison ne peut être effectué avec ce jeu de données.

## 5. Tarification
- ✅ Grille CG/standard réelle présente : base 700 XAF, 350 XAF/km, 40 XAF/min, minimum 1 000 XAF.
- ✅ L'ERP archive ancien/nouveau tarif dans `pricing_history` avant modification.
- ❌ `pricing_history` est actuellement vide : aucune modification tarifaire réelle n'a encore été validée via le nouvel ERP.
- ❌ Le backend courant ne consomme pas encore `night_multiplier`, `weekend_multiplier` et `holiday_multiplier`. Ils valent actuellement 1.0000 ; le comportement avec une majoration réelle reste à implémenter et tester.

## 6. Statistiques & Comptabilité
- ✅ Aucune commission n'est inventée : la prod contient 0 règle active.
- ✅ Une course sans règle applicable rend `netProfit = null` et l'interface/export signale un bénéfice non certifiable.
- ✅ Tests unitaires : une modification de commission en cours de période applique la bonne version à chaque course.
- ✅ Périodes jour/semaine/mois/personnalisée, filtres chauffeur/catégorie et comparaison avec période précédente ajoutés, fuseau `Africa/Brazzaville`.
- ❌ Impossible de contrôler un mois complet sur données réelles : la base actuelle ne contient que 8 courses, toutes annulées.

## 7. Exports Excel
- ✅ Filtres période/chauffeur/statut/catégorie câblés dans les exports courses ; période/chauffeur/catégorie dans l'export comptable.
- ✅ Lectures Supabase paginées par blocs de 1 000 jusqu'à 100 000 lignes pour éviter la troncature PostgREST.
- ❌ La base réelle ne contient que 8 courses : test réel sur plusieurs milliers de lignes impossible actuellement.
- ❌ Ouverture Excel/Google Sheets d'un fichier généré depuis la future preview reste à vérifier.

## 8. Paramètres généraux
- ✅ `app_settings` est une structure clé-valeur `text -> jsonb` extensible sans migration.
- ⚠️ Service ERP de création/modification générique implémenté.
- ❌ `app_settings` est actuellement vide : propagation d'une valeur réelle dans une interface concernée non testée.
- ✅ Les changements de commission créent une nouvelle ligne ; aucun UPDATE d'une ancienne règle n'est prévu dans le service ERP.

## 9. Contrôle qualité technique
- ✅ Tests unitaires ERP.
- ✅ TypeScript sans erreur.
- ✅ Build production Next.js.
- ✅ Dernier pipeline ERP complet connu vert sur la branche isolée.
- ⚠️ Test de navigation réelle/console à faire sur preview.
- ✅ Ancien admin `https://the-fast-n1-admin.vercel.app` répond et n'a pas été remplacé.

## 10. Bascule finale
- ❌ Étape 1 non validée : autorisation Vercel GitHub Actions absente.
- ❌ Jeu de données TEST_ de validation non injecté.
- ❌ Preview ERP distincte non validée.
- ❌ Test à blanc complet non effectué.
- ❌ Aucun GO n'est autorisé.
- ✅ Ancien admin reste intact comme chemin de rollback.

## Décision actuelle
**NO-GO pour la bascule du domaine production.**

Le premier bloqueur est désormais précisément identifié et reproductible : `VERCEL_TOKEN` n'est pas disponible dans GitHub Actions. Le workflow ne peut donc pas produire la preview backend obligatoire et le blocage administratif des comptes ne peut pas encore être certifié en conditions réelles. Les étapes de données de test, validation complète, preview ERP et bascule restent volontairement non exécutées tant que cette étape 1 n'est pas ✅.
