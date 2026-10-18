# FAST N°1 — Deux workflows métier : clients & chauffeurs

**Date : 18 octobre 2026 — Implémenté avec Supabase et GitHub, administration en prévisualisation.**

## Architecture réelle de FAST

Le domaine **FAST N°1 officiel** (`fast-n1-officiel`) sert principalement de vitrine commerciale. Le parcours de mobilité client/chauffeur se déroule dans l'application Android avec une interface embarquée (WebView), le backend Python et Supabase. Les validations professionnelles sont gérées dans le back-office `the-fast-n1-admin`. **Les deux workflows créés sont au niveau serveur**, et non un faux automate visuel dans la vitrine.

Chaîne générale : **site/inscription → Supabase Auth → profil client/chauffeur → contrôle compte → pièces/voiture → décision humaine pour le chauffeur → course/dispatch → contrôle PIN → paiement et historique**.

### Workflow client — entièrement automatisable pour les vérifications techniques

1. Inscription via FAST/Supabase Auth, création `profiles(role='client')`.
2. `fast_workflows.client_cycle()` toutes les 2 minutes crée l'entrée `account_admin_controls` en `pending` si nécessaire ; les décisions administratives `invalidated` et `is_active=false` ne sont jamais effacées.
3. Si **e-mail confirmé**, prénom, nom et numéro de contact présents, et compte non suspendu, l'étape **technique** passe automatiquement à `admin_status='validated'`, avec une justification et une date. Il ne s'agit pas d'une authentification de l'identité civile ni d'une vérification du téléphone par OTP.
4. Si une information manque, création d'un dossier de suivi `fast_business_work_items`. Le client complète son profil, puis le prochain cycle réévalue.
5. Une notification est créée lors de la transition vers `validated`.
6. Le nouveau garde-fou `fast_workflows.guard_client_new_ride()` **refuse la création d'une course si le compte client n'est pas validé ou e-mail non confirmé**, même si le navigateur contourne l'interface.
7. Avec un compte valide, le parcours métier existant prend le relais : point de départ et destination, géolocalisation, estimation prix, paiement/autorisation selon le marché, recherche chauffeur, suivi course et historique.
8. Les annulations, la facturation des trajets et les paiements réels restent soumis aux contrôles existants ; aucun transfert financier n'est exécuté par ce workflow.

### Workflow chauffeur — préqualification automatisée, décision d'habilitation humaine

1. Création `profiles(role='driver')` et `drivers(status='offline',is_verified=false)`, puis entrée de revue administrative `account_admin_controls`.
2. Téléversement des documents dans `driver_documents`. Les exigences dépendent du pays configuré dans `market_configs.document_requirements` : par défaut, identité, permis, carte grise, assurance, photo du chauffeur, justificatif d'adresse.
3. `fast_workflows.driver_cycle()` toutes les 2 minutes vérifie pour chaque document : présence, statut `approved` décidé par un réviseur habilité, expiration ; le suivi technique relève aussi l'emplacement de stockage, nom de fichier et taille.
4. Contrôle de l'existence d'un véhicule actif et d'une photo de véhicule enregistrée. Les fichiers eux-mêmes ne sont **pas** inspectés par OCR ni certifiés authentiques par l'IA.
5. Les anomalies créent un seul dossier idempotent `fast_business_work_items` avec codes techniques, service responsable et priorité. Les administrateurs voient les dossiers dans le nouvel onglet « Workflows clients & chauffeurs ».
6. Si un chauffeur apparaît disponible ou vérifié alors qu'il manque des pièces, son état est sécurisé : `is_verified=false`, `status=offline` si disponible. Une course déjà en état occupé n'est pas interrompue par un changement brutal de disponibilité.
7. Seul un administrateur autorisé peut approuver les documents et le compte chauffeur. L'application ne peut pas auto-approuver des documents par une mise à jour directe avec un jeton utilisateur.
8. Les gardes de base interdisent le passage `offline→available` sans compte chauffeur administrativement validé, `is_verified=true`, documents requis approuvés et non périmés, véhicule actif avec photo.
9. L'acceptation d'une offre de dispatch vérifie à nouveau l'éligibilité du chauffeur et du véhicule au niveau SQL, et le backend existant gère offre, prise en charge, départ sécurisé par PIN, fin de course et paiement selon configuration.
10. Si une pièce approuvée est retirée administrativement, la vérification du chauffeur est révoquée immédiatement ; l'utilisateur lui-même ne peut pas supprimer une pièce approuvée.

### Organisation et supervision

- **Service comptes clients** : file `workflow='client'`, valide automatiquement la conformité basique e-mail + profil.
- **Service conformité chauffeurs** : file `workflow='driver'`, surveille permis, véhicules, compte et disponibilité ; validation finale humaine.
- **Service contrôle documentaire** : file `workflow='document'`, détecte pièces manquantes, en attente, expirées, refusées ou métadonnées absentes. La décision d'authenticité est humaine.
- Les tâches sont **idempotentes**, avec `work_key` unique et résolution automatique des anomalies disparues.
- Historique non sensible dans `fast_business_workflow_runs`, RLS activé sur les tables de suivi ; consultation réservée à l'administration.
- Deux crons actifs : `fast_client_onboarding_2min` et `fast_driver_compliance_2min`.
- Route **administrateur authentifiée** de l'Edge Function existante : `GET /fast-admin-api/business-workflows` (jeton `x-fast-admin-token` validé par le serveur). Elle ne transmet pas les fichiers de permis/identité.
- Les nouveaux écrans `admin/business-workflows.js` et `admin/index.html` sont déployés **uniquement en prévisualisation Vercel**, le site officiel n'a pas été remplacé.

## Tests réalisés

1. Cycle client : `ok=true`, aucune validation à faire pour le client déjà validé.
2. Cycle chauffeur : `ok=true`, un dossier de conformité ouvert.
3. Chauffeur existant **initialement disponible/vérifié sans documents** : sécurisé ; `status=offline`, `is_verified=false`, pièces manquantes consignées.
4. Tentative SQL sans effet persistant pour mettre ce chauffeur non conforme `available` : rejet conforme.
5. Tentative SQL fictive d'insérer une course pour un compte client non validé : rejet conforme.
6. Tentative SQL fictive d'accepter une offre de course par un chauffeur non conforme : rejet conforme.
7. Les deux tâches planifiées ont affiché une dernière exécution `succeeded` après correction d'un problème de JSONB lors du premier cycle client.
8. Fonctions de cycle non exécutables par `anon` ni `authenticated`, tables de suivi avec RLS.
9. Administration Vercel **READY**, route protégée par session administrateur. Le parcours complet connecté au navigateur demeure à tester.

**Limite :** le modèle Groq de FAST n'a pas été activé dans ce travail ; une fonction existante répond `AGENT_REMOVED` (410). Ces workflows sont de **vraies automatisations SQL**, pas des inférences IA par des agents FAST. Le choix est volontaire : ne pas réactiver un moteur désactivé sans validation.

## Procédure de test métier préproduction

- Créer un client de test avec e-mail confirmé : renseigner puis supprimer fictivement une information de profil en environnement de test ; vérifier que la réservation reste bloquée tant que le compte n'est pas validé.
- Créer un chauffeur de test : uploader chaque pièce attendue, valider via l'administration habilitée ; vérifier le statut en ligne et l'acceptation d'une course test.
- Tester les cas négatifs : permis expiré, assurance absente, document rejeté, véhicule sans photo, utilisateur suspendu, compte chauffeur non validé, perte d'une pièce approuvée.
- Tester un parcours client→dispatch→PIN→course→paiement via fournisseur sandbox uniquement. Ne jamais exécuter de débit réel dans ces tests.
- Faire une recette navigateur authentifiée, puis publier les écrans sur les domaines officiels **uniquement après revue et validation de la PR**.

## Requêtes opérationnelles

```sql
SELECT fast_workflows.client_cycle();
SELECT fast_workflows.driver_cycle();
SELECT workflow,owner_department,priority,status,reason_codes FROM public.fast_business_work_items;
SELECT workflow,status,result,executed_at FROM public.fast_business_workflow_runs ORDER BY executed_at DESC LIMIT 20;
SELECT jobname,active FROM cron.job WHERE jobname IN ('fast_client_onboarding_2min','fast_driver_compliance_2min');
```
