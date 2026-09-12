# FAST ERP Next.js

Nouvelle administration FAST construite en parallèle de `admin/` afin de ne pas casser l'outil statique actuellement en production.

## Architecture
- Next.js App Router + Tailwind
- Supabase JS côté serveur pour lecture/écriture
- Recharts pour les statistiques
- SheetJS pour les exports Excel
- Aucun calcul métier stocké dans Supabase

## Variables
Copier `.env.example` vers `.env.local` puis configurer `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. La clé service role reste uniquement côté serveur et ne doit jamais être exposée dans le navigateur.

## Règle commissions
`commission_rules` est versionnée par insertion. L'ERP ne modifie pas les anciennes lignes. La règle applicable à une course est sélectionnée selon sa date avec priorité chauffeur > catégorie véhicule > globale.
