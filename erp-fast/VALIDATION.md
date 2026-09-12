# Validation ERP FAST — 12/09/2026

Référence : checklist de validation avant bascule Vercel.

## Légende
- ✅ vérifié
- ⚠️ partiellement vérifié / code prêt mais test réel restant
- ❌ bloquant avant bascule

## 0. Configuration générale
- ✅ Projet Supabase de production identifié : `hmwxwzfcpdvgzjgxruup` — The Fast N°1.
- ❌ Aucune preview Vercel distincte du nouvel ERP n'existe encore ; par conséquent la parité de variables Vercel preview/prod n'est pas vérifiable.
- ✅ Migration `erp_fast_core` appliquée sur Supabase production (migration version `20260912101508`).

## 1. Tableau de bord
- ⚠️ Contrôle manuel des données source effectué : 1 client, 1 chauffeur offline, 8 courses toutes annulées, 0 course active, 0 CA de courses terminées, 0 règle de commission. Le rendu réel sur preview reste à vérifier.
- ✅ Le calcul gère une période sans course terminée et renvoie des zéros sans crash dans les tests/build.

## 2. Chauffeurs
- ✅ Recherche, filtres disponibilité/statut admin et tris ajoutés à la page Chauffeurs.
- ✅ Absence de ligne `account_admin_controls` => affichage `pending` et compte considéré actif par défaut.
- ⚠️ Validation/refus individuel des documents implémenté, mais la prod contient actuellement 0 document chauffeur : pas de test réel de persistance possible.
- ✅ Le contrôle administratif utilise `account_admin_controls` et n'écrit jamais dans `drivers.status`.
- ⚠️ Blocage des comptes désactivés/invalidés ajouté et testé dans le backend, mais le commit n'est pas encore déployé sur le backend Vercel de production.

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
- ❌ Aucune modification tarifaire réelle n'a encore été faite dans le nouvel ERP ; `pricing_history` est vide.
- ❌ Le backend de tarification courant ne consomme pas encore les multiplicateurs nuit/week-end/jours fériés. Les multiplicateurs réels sont actuellement tous à 1.0000, donc aucun impact tarifaire aujourd'hui, mais le comportement avec une majoration non nulle reste à implémenter et tester.

## 6. Statistiques & Comptabilité
- ✅ Aucune commission n'est inventée : la prod contient 0 règle active.
- ✅ Une course sans règle applicable rend désormais `netProfit = null` et l'interface/export signale un bénéfice non certifiable.
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
- ✅ Tests unitaires.
- ✅ TypeScript sans erreur.
- ✅ Build production Next.js.
- ⚠️ Dernier pipeline ERP complet vert sur la branche isolée ; test de navigation réelle/console à faire sur preview.
- ✅ Ancien admin `https://the-fast-n1-admin.vercel.app` répond HTTP 200 et n'a pas été remplacé.

## 10. Bascule finale
- ❌ Preview Vercel distincte non créée.
- ❌ Test à blanc complet avec vraies données non effectué.
- ❌ Tous les modules ne sont donc pas encore validés en preview.
- ❌ Aucune bascule du domaine production ne doit être faite maintenant.
- ✅ Ancien admin est conservé et constitue le chemin de rollback.

## Décision actuelle
**NO-GO pour la bascule du domaine production.**

Les principaux bloqueurs sont : preview Vercel distincte absente, règles de commission réelles non configurées, absence de données réelles suffisantes pour les tests documents/courses terminées/exports volumineux, backend de blocage administratif non encore déployé, et application réelle des majorations tarifaires encore absente du backend.
