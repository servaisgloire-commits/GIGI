# FAST N°1 — Passerelle ChatGPT (AGENT G)
Statut : passerelle GitHub pour les demandes **publiques et non sensibles** ; l'intégration privée des discussions FAST Connect n'est pas encore en production.

## Rôles et sécurité
Gabriel (AGENT_G) dirige, répartit et répond sous les 18 rôles FAST. Les échanges publics GitHub peuvent servir de boîte de missions techniques. Toute donnée client/chauffeur, adresse privée, pièce d'identité, mot de passe, token, information de course ou extrait d'une discussion interne FAST Connect est exclue de GitHub public.
Aucune suppression de données, aucune signature, aucune modification de règles tarifaires/dispatch/paiements, aucune fusion de Pull Request ou déploiement en production sans autorisation humaine.

## Canal opérationnel actuel : GitHub
Créer une Issue **nouvelle** titrée exactement `[FAST-AGENT] <objet non sensible>`, dans ce dépôt, en remplissant les champs du modèle. Une tâche ChatGPT peut examiner périodiquement les tickets et répondre par un commentaire préfixé `[AGENT G — ChatGPT]`. Cela **ne signifie pas** que les agents FAST Connect sont directement reliés à cette conversation. Les commentaires GitHub sont publics.

## Canal cible : FAST Connect privé (nécessite AppDeploy)
1. Mettre en place un dépôt GitHub **privé dédié** aux échanges entre FAST Connect et ChatGPT (ne pas utiliser ce dépôt public pour des chats privés). Connecter ce dépôt à l'intégration GitHub ChatGPT.
2. Configurer, hors conversation, un jeton GitHub limité à ce dépôt dans AppDeploy sous le nom `FAST_GITHUB_TOKEN`, et le dépôt privé sous le paramètre `FAST_BRIDGE_REPO`. Ne jamais commiter les secrets.
3. FAST Connect reçoit la demande, l'archive sans suppression, poste la mission correspondante en Issue privée et affiche un statut `en attente de réponse`.
4. ChatGPT lit les Issues autorisées lors de ses exécutions planifiées, traite le rôle demandé et écrit une réponse ou une proposition de code vérifiable. Une tâche planifiée n'est pas une réponse instantanée.
5. Le cron de FAST Connect importe de façon idempotente les réponses et les publie dans le bon canal, avec la mention `AGENT G / ChatGPT`. Les PDF sont générés et archivés localement dans FAST Connect à 7 h Europe/Paris, même en l'absence de nouvelles activités.
6. Avant mise en production, vérifier l'authentification, les autorisations des canaux, le refus de contenus sensibles, l'idempotence, l'accès aux PDF privés et la conservation des historiques.

## Rapports
Le rapport quotidien ChatGPT de 7 h est programmé séparément. L'archivage **automatique dans les salons** n'est pas connecté tant que la passerelle n'est pas déployée. Ne pas inventer des contrôles ni des missions réalisées.
