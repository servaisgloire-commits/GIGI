# FAST Connect — application Android

Cette application Android affiche l'application officielle de discussion FAST Connect sur `https://fast-n1-connect.vercel.app/`.

**Package Android propre** : `com.fastn1.connect`. Il ne remplace pas ni ne tente de mettre à jour l'APK FAST N°1 des courses/chauffeurs.

## Sécurité
- HTTPS uniquement, hôte FAST Connect strict.
- Les liens externes s'ouvrent dans le navigateur.
- Aucun secret Supabase dans l'APK ; les sessions appartiennent au site hébergé.
- Aucun droit de suppression ni accès direct à la base depuis le code Android.

## Construire
La CI GitHub Actions sur la branche `fast-connect-apk-20261016` exécute Gradle 8.7 + Android Gradle Plugin 8.6.1, Android SDK 35, JDK 17, `:app:assembleDebug`.
Le résultat est dans l'artefact `FAST-Connect-APK-Android` de l'exécution GitHub Actions.

**Signature de test** : un APK debug est signé automatiquement avec une clé générée par le runner. Cette clé n'est PAS garantie identique entre deux exécutions. Pour les mises à jour durables, mettre en place une clé de signature release sécurisée et stable dans un coffre ou GitHub Actions Secrets ; ne jamais déposer de clé privée dans ce dépôt PUBLIC. Aucun APK Android existant de FAST N°1 ne sera remplacé.

## Installer
Télécharger l'artefact ZIP de GitHub Actions, extraire `app-debug.apk`, puis ouvrir le fichier sur le téléphone Android. Si nécessaire, autoriser l'installation depuis le gestionnaire de fichiers concerné. Une connexion Internet est requise.

## Fonctionnalités
- Connexion sécurisée à FAST Connect, salons, entraide hiérarchique N+1, rapports et organigramme : les pages sont mises à jour sur Vercel.
- Quitter : double appui Retour sur l'écran d'accueil.
- L'application ne dispose pas de notifications push natives (fonctionnalité non intégrée).
