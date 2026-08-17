# FAST N°1 Python Backend

Backend FastAPI de FAST N°1.

## Flux
Android FAST -> API Python HTTPS -> Supabase PostgreSQL

## Endpoints
- GET /health
- POST /v1/version/check
- POST /v1/rides
- POST /v1/drivers/location
- POST /v1/dispatch

## Variables serveur obligatoires
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (SECRET, ne jamais mettre dans l'APK ou dans Git)
- APP_VERSION
- MIN_ANDROID_VERSION
- ANDROID_UPDATE_URL

## Lancement local
pip install -r requirements.txt
uvicorn app.main:app --reload

## Déploiement
Le Dockerfile permet de déployer le dossier backend sur un hébergeur Docker/Python. Après déploiement, remplacer PYTHON_API_URL dans app/build.gradle.kts par l'URL HTTPS réelle du backend.
