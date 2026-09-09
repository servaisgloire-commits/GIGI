# FAST N°1

Application de réservation de courses : client Android, administration web et API Python.

## Navigation centralisée

L’administration propose quatre espaces, avec les sections affichées ensemble :

| Espace | Contenu |
| --- | --- |
| Vue d’ensemble | Indicateurs, activité récente et toutes les courses |
| Personnes | Chauffeurs, clients et justificatifs à contrôler |
| Finances | Paiements clients, contrôle des virements et paie chauffeurs |
| Configuration | Pays, moyens de paiement et tarifs |

Le sélecteur « Données à exporter » choisit la section à exporter en Excel.
Les filtres propres à chaque liste restent disponibles.

L’application passager propose **Accueil**, **Courses** et **Mon compte**.
Mon compte rassemble le portefeuille, les moyens de paiement et l’assistance.
Les justificatifs chauffeurs sont conservés pour leur validation.

## Organisation

- `app/` : application Android et interface web embarquée.
- `admin/` : administration web statique.
- `backend/` : API FastAPI, tests et image Docker.
- `updates/latest.json` : informations de mise à jour Android.
- `.github/workflows/` : construction Android et contrôles de production.

Certains scripts et styles Android sont injectés par `MainActivity.kt` : leur
absence dans `index.html` ne signifie pas qu’ils sont inutilisés.

## API Python en local

Depuis le dossier `backend`, avec Python 3.12 :

```sh
python -m pip install -r requirements.txt pytest
python -m uvicorn app.main:app --reload
python -m pytest -q tests
```

Configurer côté serveur `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`APP_VERSION`, `MIN_ANDROID_VERSION` et `ANDROID_UPDATE_URL`.
La clé de service doit rester secrète et ne doit jamais être ajoutée au dépôt
ou à l’APK. Consulter `backend/app/main.py` pour les autres options et routes.

Routes principales : `GET /health`, `POST /v1/version/check`,
`POST /v1/rides`, `POST /v1/drivers/location` et `POST /v1/dispatch`.

## Construction et hébergement

La construction Android est définie dans `.github/workflows/android.yml` :
JDK 17, SDK Android 35 et configuration Gradle du dépôt.
La clé Google Maps peut être fournie via `FAST_GOOGLE_MAPS_API_KEY`.
La signature de production utilise `FAST_KEYSTORE_PATH`,
`FAST_KEYSTORE_PASSWORD`, `FAST_KEY_ALIAS` et `FAST_KEY_PASSWORD`.

Le backend dispose d’un `Dockerfile` et d’une configuration Vercel.
L’administration possède sa propre configuration Vercel dans `admin/`.
Après un changement d’hébergement, adapter les URL correspondantes dans la
configuration Android et les clients API. Les modifications locales ne déploient
pas automatiquement ces services.
