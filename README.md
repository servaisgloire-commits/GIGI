# FAST N°1

FAST N°1 est une application Android de mobilité développée pour un usage client et chauffeur. Le projet combine une application Android/WebView, un backend Python, Supabase, un espace d'administration et plusieurs couches de sécurité et de fiabilité.

## Fonctionnalités principales

### Côté client
- géolocalisation et choix d'adresse ;
- estimation distance, durée et prix ;
- prix standard FAST ou proposition de prix flexible au chauffeur ;
- paiement par carte, espèces ou moyens disponibles selon le pays ;
- virement bancaire lorsque le marché le permet ;
- suivi de la course et historique ;
- assistance et gestion du profil.

### Côté chauffeur
- disponibilité en ligne / hors ligne ;
- réception des demandes de course ;
- affichage du prix proposé par le client et du prix standard ;
- acceptation ou refus d'une course ;
- navigation et suivi GPS ;
- étapes d'approche, démarrage et fin de course ;
- gestion des informations chauffeur et documents.

### Administration
- tableau de bord ;
- clients et chauffeurs ;
- validation des chauffeurs et documents ;
- suivi des courses ;
- paiements et profils de versement ;
- configuration pays, moyens de paiement et tarification.

## Architecture

```text
FAST N°1
├── app/                 Application Android
│   └── src/main/assets  Interface FAST embarquée
├── backend/             API Python
├── admin/               Interface d'administration
├── updates/             Métadonnées de mise à jour
└── .github/workflows/   Build, tests et contrôles de production
```

Le frontend Android est servi localement dans une WebView via `WebViewAssetLoader`. Les données et fonctions métier reposent sur Supabase et le backend FAST. Les secrets serveur ne doivent jamais être intégrés dans l'application cliente.

## Fiabilité Android

Le build 614 renforce notamment :
- la prévention du double chargement des scripts et feuilles de style ;
- le focus tactile de la WebView ;
- la reprise correcte de la WebView après retour dans l'application ;
- la destruction propre de la WebView à la fermeture ;
- les contrôles CI afin d'éviter la réintroduction de permissions ou mécanismes d'installation APK non souhaités.

## Qualité et sécurité

Les workflows GitHub vérifient notamment :
- la syntaxe JavaScript ;
- la compilation Python ;
- les tests backend ;
- la compilation Android debug et release ;
- la cohérence du numéro de build ;
- la signature de l'APK de production lorsqu'une clé de signature est disponible ;
- l'absence de clés serveur secrètes dans le dépôt ;
- l'absence de permissions d'installation d'APK inutiles ;
- plusieurs protections contre des régressions déjà rencontrées.

## Build Android

Prérequis : Java 17 et Gradle 8.9.

```bash
gradle assembleDebug
```

Pour une release signée, les informations de signature sont fournies au build par les secrets d'environnement prévus par le workflow GitHub Actions.

## Version actuelle

**FAST 6.0 — build 614**

Le projet évolue par itérations courtes avec validation du comportement client, chauffeur, paiement, dispatch et stabilité Android.
