# Atlas technique des agents — FAST

> Inventaire produit à partir du dépôt GitHub servaisgloire-commits/GIGI, branche principale à f4ee436fb82bf9dce08102f2f3574ee3cebcf374.
> Ne contient ni mot de passe, ni clé privée, ni information personnelle. Les fichiers inventoriés ne sont pas nécessairement tous testés fonctionnellement.

## Périmètre technique
- Organisation : **FAST exclusivement**
- Dépôt : servaisgloire-commits/GIGI
- Supabase : hmwxwzfcpdvgzjgxruup
- Vercel (projets autorisés) : fast-n1-officiel, fast-n1-python-api
- Inventaire source : **113 fichiers** à la révision f4ee436fb82bf9dce08102f2f3574ee3cebcf374.
- Base : **84 objets tabulaires documentés** (les vues, fonctions et données réelles nécessitent des vérifications complémentaires).

## Règles de maintenance
1. Les agents FAST ne peuvent jamais accéder à Talent Congo, et réciproquement.
2. Toutes les opérations de lecture des sources et des métadonnées sont traçables et non destructives.
3. Aucun agent ne doit recevoir un jeton administrateur capable de supprimer du contenu ou des ressources.
4. Les correctifs doivent reposer sur un bug réel, une branche dédiée, les tests sur le SHA exact et une possibilité de retour arrière.
5. Toute fonctionnalité, interface ou règle métier nouvelle doit recevoir la validation du propriétaire.
6. Aucun mot de passe, document personnel, CV, facture, bulletin, pièce d'identité, RIB ou jeton secret ne doit être transmis au modèle.

## Tous les chemins sources inventoriés

### .github (14)
- `.github/ISSUE_TEMPLATE/fast-agent.yml`
- `.github/workflows/android-preproduction-compile.yml`
- `.github/workflows/android.yml`
- `.github/workflows/apply-fast-backend-resilience.yml`
- `.github/workflows/backend-deploy.yml`
- `.github/workflows/driver-preproduction-audit.yml`
- `.github/workflows/fast-10k-persistent-audit.yml`
- `.github/workflows/fast-admin-deploy.yml`
- `.github/workflows/fast-brand-qa.yml`
- `.github/workflows/fast-signing-tool.yml`
- `.github/workflows/fast-stable-unsigned.yml`
- `.github/workflows/fast-web-qa-deploy.yml`
- `.github/workflows/playstore-bundle.yml`
- `.github/workflows/production-gate.yml`

### .load-audit-trigger-20260913-2 (1)
- `.load-audit-trigger-20260913-2`

### README-temp (1)
- `README-temp`

### README.md (1)
- `README.md`

### admin (16)
- `admin/admin-users.js`
- `admin/app.js`
- `admin/business-workspace.css`
- `admin/business-workspace.js`
- `admin/export-modern.js`
- `admin/fast-logo.svg`
- `admin/index.html`
- `admin/manual-actions.js`
- `admin/payment-actions.js`
- `admin/pro-workspace.css`
- `admin/site-editor-refresh.js`
- `admin/site/api/download.js`
- `admin/site/fast-logo.svg`
- `admin/site/index.html`
- `admin/styles.css`
- `admin/vercel.json`

### app (31)
- `app/build.gradle.kts`
- `app/proguard-rules.pro`
- `app/proguard-test-rules.pro`
- `app/src/androidTest/java/cg/fast/n1/DriverMapRuntimeTest.kt`
- `app/src/androidTest/java/cg/fast/n1/MainMapRuntimeTest.kt`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/assets/address-search.js`
- `app/src/main/assets/app.js`
- `app/src/main/assets/back-navigation.js`
- `app/src/main/assets/client-sheet-drag.js`
- `app/src/main/assets/client-ui-recovery.js`
- `app/src/main/assets/compat.js`
- `app/src/main/assets/core.js`
- `app/src/main/assets/driver-identity.css`
- `app/src/main/assets/driver-identity.js`
- `app/src/main/assets/driver-native-map.css`
- `app/src/main/assets/driver-native-map.js`
- `app/src/main/assets/fast-logo.svg`
- `app/src/main/assets/fast-simplified.js`
- `app/src/main/assets/google-live-map.js`
- `app/src/main/assets/google-map.css`
- `app/src/main/assets/index.html`
- `app/src/main/assets/native-main-map.js`
- `app/src/main/assets/one-finger-map.js`
- `app/src/main/assets/stable-map.js`
- `app/src/main/assets/styles.css`
- `app/src/main/java/cg/fast/n1/DriverMapActivity.kt`
- `app/src/main/java/cg/fast/n1/DriverOfferService.kt`
- `app/src/main/java/cg/fast/n1/MainActivity.kt`
- `app/src/main/res/drawable/fast_logo.xml`
- `app/src/main/res/values/styles.xml`

### audits (1)
- `audits/fast-10k-load-20260913.txt`

### backend (22)
- `backend/.deploy-resilience-20260912`
- `backend/.env.example`
- `backend/Dockerfile`
- `backend/README.md`
- `backend/api/agent-brain.js`
- `backend/app/__init__.py`
- `backend/app/account_control_guard.py`
- `backend/app/auth_memory.py`
- `backend/app/auth_proxy.py`
- `backend/app/flex_main.py`
- `backend/app/global_main.py`
- `backend/app/http_pool.py`
- `backend/app/main.py`
- `backend/app/vehicle_main.py`
- `backend/public/reset-password.html`
- `backend/requirements.txt`
- `backend/tests/test_auth_proxy.py`
- `backend/tests/test_capacity_hardening.py`
- `backend/tests/test_core.py`
- `backend/tests/test_driver_audit.py`
- `backend/tests/test_mobile_contract.py`
- `backend/vercel.json`

### build.gradle.kts (1)
- `build.gradle.kts`

### docs (1)
- `docs/FAST_CONNECT_CHATGPT_BRIDGE.md`

### gradle.properties (1)
- `gradle.properties`

### settings.gradle.kts (1)
- `settings.gradle.kts`

### supabase (8)
- `supabase/migrations/20260912_erp_fast_core.sql`
- `supabase/migrations/20260912_vehicle_photo_required.sql`
- `supabase/migrations/20260914_add_android_maps_key_reader.sql`
- `supabase/migrations/20260914_allow_client_cancel_until_start.sql`
- `supabase/migrations/20260914_driver_profile_photos.sql`
- `supabase/migrations/20260914_require_verified_pin_before_start.sql`
- `supabase/migrations/20260924_fast_capacity_indexes.sql`
- `supabase/migrations/20260924_security_g_hardening.sql`

### tests (12)
- `tests/.fast-10k-audit-20260913`
- `tests/address-search-regression.mjs`
- `tests/app-close-search-smoke.mjs`
- `tests/autofill-regression.mjs`
- `tests/back-navigation-regression.mjs`
- `tests/booking-regression.mjs`
- `tests/client-rebuild-smoke.mjs`
- `tests/driver-map-smoke.mjs`
- `tests/driver-restart-pin-smoke.mjs`
- `tests/fast-mobile-smoke.mjs`
- `tests/full-ride-flow-contract.mjs`
- `tests/session-touch-navigation-notification-regression.mjs`

### tools (1)
- `tools/patch_fast_backend_resilience.py`

### updates (1)
- `updates/latest.json`

## Modèle de données Supabase : colonnes et structures

### dsi_ops.agent_learning (10 colonnes)
id (bigint), organization (text), agent_name (text), incident_id (bigint), error_signature (text), lesson (text), corrective_action (text), outcome (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### dsi_ops.agent_messages (7 colonnes)
id (bigint), incident_id (bigint), task_id (bigint), author_agent (text), topic (text), content (text), posted_at (timestamp with time zone)

### dsi_ops.agent_tasks (15 colonnes)
id (bigint), incident_id (bigint), organization (text), stage (text), assigned_agent (text), status (text), provider (text), model (text), output (text), last_error (text), attempts (integer), started_at (timestamp with time zone), completed_at (timestamp with time zone), created_at (timestamp with time zone), run_number (integer)

### dsi_ops.agents (6 colonnes)
id (bigint), organization (text), name (text), pole (text), role_description (text), enabled (boolean)

### dsi_ops.audit_events (5 colonnes)
id (bigint), happened_at (timestamp with time zone), event_type (text), subject (text), details (jsonb)

### dsi_ops.chatgpt_reviews (9 colonnes)
id (bigint), candidate_id (bigint), revision_sha (text), verdict (text), reviewer (text), model (text), provider_request_id (text), review_summary (text), created_at (timestamp with time zone)

### dsi_ops.code_repositories (7 colonnes)
organization (text), full_name (text), branch (text), ci_workflow (text), source_verified (boolean), deployment_bridge_enabled (boolean), reviewed_at (timestamp with time zone)

### dsi_ops.cycles (7 colonnes)
id (bigint), started_at (timestamp with time zone), finished_at (timestamp with time zone), state (text), probed (integer), errors (integer), details (jsonb)

### dsi_ops.data_access_controls (8 colonnes)
id (bigint), organization (text), table_name (text), pole (text), owner_agent (text), last_checked_at (timestamp with time zone), last_status (text), last_details (jsonb)

### dsi_ops.data_access_scan_runs (4 colonnes)
id (bigint), checked_at (timestamp with time zone), checked_tables (integer), findings (integer)

### dsi_ops.incidents (15 colonnes)
id (bigint), key (text), organization (text), category (text), title (text), description (text), severity (text), state (text), owner_agent (text), security_tester (text), functional_tester (text), first_seen (timestamp with time zone), last_seen (timestamp with time zone), recovered_at (timestamp with time zone), reopens (integer)

### dsi_ops.patch_candidates (10 colonnes)
id (bigint), incident_id (bigint), author_agent (text), repository (text), branch (text), revision_sha (text), explanation (text), status (text), created_at (timestamp with time zone), validated_at (timestamp with time zone)

### dsi_ops.probe_results (6 colonnes)
id (bigint), probe_id (bigint), checked_at (timestamp with time zone), http_status (integer), ok (boolean), detail (text)

### dsi_ops.probes (12 colonnes)
id (bigint), organization (text), key (text), url (text), owner_agent (text), last_request_id (bigint), last_requested_at (timestamp with time zone), last_checked_at (timestamp with time zone), http_status (integer), failures (integer), last_error (text), enabled (boolean)

### dsi_ops.settings (9 colonnes)
organization (text), lead_name (text), qa_name (text), security_name (text), auditor_name (text), monitor_enabled (boolean), auto_code_generation (boolean), production_deployment_enabled (boolean), interval_minutes (integer)

### dsi_ops.test_results (8 colonnes)
id (bigint), candidate_id (bigint), kind (text), tester (text), revision_sha (text), passed (boolean), evidence (text), created_at (timestamp with time zone)

### public.account_admin_controls (9 colonnes)
user_id (uuid), account_role (text), admin_status (text), is_active (boolean), internal_reason (text), validated_at (timestamp with time zone), invalidated_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.app_settings (3 colonnes)
key (text), value (jsonb), updated_at (timestamp with time zone)

### public.auth_email_memory (6 colonnes)
email_hash (text), last_sent_at (timestamp with time zone), blocked_until (timestamp with time zone), attempts (integer), last_status (text), updated_at (timestamp with time zone)

### public.device_tokens (6 colonnes)
id (uuid), user_id (uuid), platform (text), token (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.dispatch_offers (17 colonnes)
id (uuid), ride_id (uuid), driver_id (uuid), vehicle_id (uuid), distance_km (numeric), eta_min (integer), driver_rating (numeric), driver_total_rides (integer), score (numeric), status (text), standard_price (numeric), offered_price (numeric), currency (text), pricing_mode (text), offered_at (timestamp with time zone), responded_at (timestamp with time zone), expires_at (timestamp with time zone)

### public.driver_documents (14 colonnes)
id (uuid), driver_id (uuid), document_type (text), storage_path (text), file_name (text), mime_type (text), file_size_bytes (bigint), expires_at (date), country_code (text), status (text), rejection_reason (text), reviewed_by (uuid), reviewed_at (timestamp with time zone), created_at (timestamp with time zone)

### public.driver_locations (11 colonnes)
driver_id (uuid), latitude (double precision), longitude (double precision), heading (double precision), speed_kmh (double precision), accuracy_m (double precision), country_code (text), country_name (text), country_detected_at (timestamp with time zone), updated_at (timestamp with time zone), location (USER-DEFINED)

### public.driver_payout_profiles (12 colonnes)
driver_id (uuid), payout_method (text), account_holder (text), phone_number (text), mobile_operator (text), bank_name (text), iban_or_account (text), country_code (text), payout_currency (text), is_complete (boolean), payout_status (text), updated_at (timestamp with time zone)

### public.drivers (7 colonnes)
user_id (uuid), status (USER-DEFINED), is_verified (boolean), rating (numeric), total_rides (integer), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_admin_audit (7 colonnes)
id (bigint), username (text), action (text), target_type (text), target_id (text), details (jsonb), created_at (timestamp with time zone)

### public.fast_admin_dataset_rows (5 colonnes)
dataset_id (uuid), dataset_name (text), created_at (timestamp with time zone), row_number (bigint), data (jsonb)

### public.fast_admin_datasets (12 colonnes)
id (uuid), name (text), headers (jsonb), rows (jsonb), row_count (integer), created_at (timestamp with time zone), source_type (text), status (text), checksum (text), imported_by (text), metadata (jsonb), updated_at (timestamp with time zone)

### public.fast_admin_users (11 colonnes)
id (uuid), username (text), display_name (text), credential_hash (text), credential_salt (text), credential_iterations (integer), role (text), is_active (boolean), last_login_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_agent_approvals (10 colonnes)
id (uuid), agent_code (text), run_id (uuid), action_type (text), payload (jsonb), reason (text), status (text), requested_at (timestamp with time zone), decided_at (timestamp with time zone), decided_by (text)

### public.fast_agent_change_proposals (14 colonnes)
id (uuid), proposed_by (text), target_table (text), operation (text), selector (jsonb), changes (jsonb), reason (text), risk_level (text), status (text), proposed_at (timestamp with time zone), approved_at (timestamp with time zone), approved_by (text), executed_at (timestamp with time zone), execution_result (jsonb)

### public.fast_agent_events (8 colonnes)
id (uuid), run_id (uuid), agent_code (text), severity (text), category (text), title (text), details (jsonb), created_at (timestamp with time zone)

### public.fast_agent_memory (9 colonnes)
id (uuid), agent_code (text), memory_key (text), memory_value (jsonb), confidence (numeric), source (text), mutable (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_agent_registry (15 colonnes)
id (uuid), agent_code (text), display_name (text), scope (text), status (text), autonomy_mode (text), allowed_actions (jsonb), approval_required_actions (jsonb), locked_rules (jsonb), config (jsonb), token_hash (text), last_seen_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone), forbidden_actions (jsonb)

### public.fast_agent_runs (10 colonnes)
id (uuid), agent_code (text), trigger_source (text), status (text), started_at (timestamp with time zone), finished_at (timestamp with time zone), observations (jsonb), decisions (jsonb), verification (jsonb), error (text)

### public.fast_agent_tasks (13 colonnes)
id (uuid), agent_code (text), run_id (uuid), kind (text), dedupe_key (text), priority (text), payload (jsonb), status (text), attempts (integer), max_attempts (integer), due_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_agent_vercel_requests (11 colonnes)
id (uuid), organization (text), agent_code (text), agent_group (text), project_name (text), operation (text), status (text), result_summary (text), source_url (text), requested_at (timestamp with time zone), finished_at (timestamp with time zone)

### public.fast_ai_dialogue (12 colonnes)
id (uuid), sender (text), recipient (text), topic (text), message (text), answer (text), model_provider (text), model_name (text), status (text), error_code (text), created_at (timestamp with time zone), completed_at (timestamp with time zone)

### public.fast_business_work_items (12 colonnes)
id (uuid), work_key (text), subject_id (uuid), workflow (text), owner_department (text), priority (text), status (text), reason_codes (jsonb), human_review_required (boolean), first_seen_at (timestamp with time zone), last_seen_at (timestamp with time zone), resolved_at (timestamp with time zone)

### public.fast_business_workflow_runs (5 colonnes)
id (uuid), workflow (text), status (text), result (jsonb), executed_at (timestamp with time zone)

### public.fast_communication_messages (11 colonnes)
id (uuid), thread_id (uuid), sender_type (text), sender_user_id (uuid), message (text), reply_to_id (uuid), status (text), category (text), requires_human (boolean), handled_by_agent (text), created_at (timestamp with time zone)

### public.fast_communication_threads (7 colonnes)
id (uuid), user_id (uuid), subject (text), status (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), last_message_at (timestamp with time zone)

### public.fast_company_bank (10 colonnes)
id (smallint), account_holder (text), iban (text), bic_swift (text), bank_name (text), bank_address (text), correspondent_swift (text), currency (text), active (boolean), updated_at (timestamp with time zone)

### public.fast_design_proposals (10 colonnes)
id (uuid), agent_code (text), area (text), title (text), goal (text), proposal (jsonb), rationale (text), status (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_director_directives (10 colonnes)
id (uuid), order_id (uuid), issued_by (text), target_agent_code (text), chain (jsonb), directive (text), status (text), requires_approval (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_director_mail_log (9 colonnes)
id (uuid), message_key (text), to_email (text), from_email (text), subject (text), status (text), sent_at (timestamp with time zone), error (text), created_at (timestamp with time zone)

### public.fast_director_orders (11 colonnes)
id (uuid), source (text), source_reference (text), sender_email (text), order_text (text), requested_agent_code (text), priority (text), status (text), created_at (timestamp with time zone), handled_at (timestamp with time zone), result (jsonb)

### public.fast_discussion_agent_requests (9 colonnes)
id (uuid), message_id (uuid), channel_slug (text), agent_code (text), requested_by (text), status (text), requested_at (timestamp with time zone), replied_at (timestamp with time zone), response_message_id (uuid)

### public.fast_discussion_agents (7 colonnes)
code (text), display_name (text), mission (text), channel_slug (text), manager (text), is_director (boolean), created_at (timestamp with time zone)

### public.fast_discussion_channels (6 colonnes)
slug (text), label (text), access_level (text), sort_order (integer), description (text), created_at (timestamp with time zone)

### public.fast_discussion_collaboration_actions (9 colonnes)
id (uuid), case_id (uuid), action_order (integer), assigned_agent_code (text), action_text (text), status (text), verification_text (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_discussion_collaboration_cases (19 colonnes)
id (uuid), channel_slug (text), initiator_agent_code (text), helper_agent_code (text), title (text), blocker (text), created_by_email (text), source_message_id (uuid), status (text), severity (text), conclusion (text), created_at (timestamp with time zone), resolved_at (timestamp with time zone), owner_agent_code (text), requesting_service (text), requested_service (text), decision_summary (text), verification_plan (text), updated_at (timestamp with time zone)

### public.fast_discussion_collaboration_exchanges (9 colonnes)
id (uuid), case_id (uuid), turn_no (integer), from_agent_code (text), to_agent_code (text), message_kind (text), body (text), generated_by (text), created_at (timestamp with time zone)

### public.fast_discussion_collaboration_participants (4 colonnes)
case_id (uuid), agent_code (text), role (text), added_at (timestamp with time zone)

### public.fast_discussion_collaboration_reviews (10 colonnes)
id (uuid), case_id (uuid), review_stage (text), subject_agent_code (text), reviewer_agent_code (text), decision (text), reasoning (text), test_evidence (text), generated_by (text), created_at (timestamp with time zone)

### public.fast_discussion_members (6 colonnes)
email (text), display_name (text), role (text), active (boolean), added_by (text), created_at (timestamp with time zone)

### public.fast_discussion_messages (9 colonnes)
id (uuid), channel_slug (text), sender_email (text), sender_name (text), sender_kind (text), body (text), agent_code (text), reply_to (uuid), created_at (timestamp with time zone)

### public.fast_discussion_problem_events (10 colonnes)
id (uuid), source_type (text), source_id (uuid), agent_code (text), case_id (uuid), problem_title (text), problem_detail (text), status (text), detected_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_discussion_reports (10 colonnes)
id (uuid), channel_slug (text), agent_code (text), report_date (date), title (text), report_text (text), verification_status (text), pdf_path (text), source (text), generated_at (timestamp with time zone)

### public.fast_dsi_ai_assignments (9 colonnes)
agent_name (text), department (text), role_description (text), provider (text), model (text), ai_enabled (boolean), can_propose_fixes (boolean), can_deploy_production (boolean), updated_at (timestamp with time zone)

### public.fast_org_deliverables (10 colonnes)
id (uuid), agent_code (text), mission (text), period_key (text), title (text), summary (text), payload (jsonb), status (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_org_web_checks (9 colonnes)
id (uuid), agent_code (text), service_name (text), url (text), checked_at (timestamp with time zone), http_status (integer), classification (text), response_ms (integer), detail (text)

### public.fast_security_findings (11 colonnes)
id (uuid), agent_code (text), severity (text), category (text), title (text), details (jsonb), recommendation (text), status (text), created_at (timestamp with time zone), updated_at (timestamp with time zone), fingerprint (text)

### public.fast_signing_secrets (8 colonnes)
name (text), keystore_b64 (text), store_password (text), key_alias (text), key_password (text), cert_sha256 (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.fast_site_config (3 colonnes)
id (smallint), config (jsonb), updated_at (timestamp with time zone)

### public.market_configs (11 colonnes)
country_code (text), country_name (text), currency (text), locale (text), enabled (boolean), payment_methods (jsonb), payout_methods (jsonb), mobile_money_operators (jsonb), document_requirements (jsonb), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.market_pricing (15 colonnes)
id (uuid), country_code (text), service_type (text), base_fare (numeric), per_km (numeric), per_minute (numeric), minimum_fare (numeric), booking_fee (numeric), currency (text), night_multiplier (numeric), weekend_multiplier (numeric), holiday_multiplier (numeric), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.notifications (7 colonnes)
id (uuid), user_id (uuid), title (text), body (text), data (jsonb), read_at (timestamp with time zone), created_at (timestamp with time zone)

### public.payment_methods (13 colonnes)
id (uuid), user_id (uuid), method_type (USER-DEFINED), provider (text), provider_token (text), display_label (text), phone_number (text), card_brand (text), card_last4 (text), is_default (boolean), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.payments (15 colonnes)
id (uuid), ride_id (uuid), user_id (uuid), payment_method_id (uuid), method_type (USER-DEFINED), provider (text), provider_reference (text), amount (numeric), currency (text), status (USER-DEFINED), failure_reason (text), metadata (jsonb), paid_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.platform_bank_accounts (13 colonnes)
id (uuid), label (text), account_holder (text), iban (text), bic_swift (text), intermediary_bic_swift (text), bank_name (text), bank_address (text), country_code (text), currency (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.pricing_config (10 colonnes)
id (uuid), service_type (text), base_fare_xaf (numeric), per_km_xaf (numeric), per_minute_xaf (numeric), minimum_fare_xaf (numeric), booking_fee_xaf (numeric), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.profiles (10 colonnes)
id (uuid), role (USER-DEFINED), first_name (text), last_name (text), phone (text), email (text), avatar_url (text), country_code (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.ratings (7 colonnes)
id (uuid), ride_id (uuid), from_user_id (uuid), to_user_id (uuid), score (smallint), comment (text), created_at (timestamp with time zone)

### public.ride_events (6 colonnes)
id (bigint), ride_id (uuid), event_type (text), actor_user_id (uuid), payload (jsonb), created_at (timestamp with time zone)

### public.ride_security (11 colonnes)
ride_id (uuid), pin_hash (text), pin_ciphertext (bytea), pin_issued_at (timestamp with time zone), pin_verified_at (timestamp with time zone), pin_failed_attempts (integer), pin_locked_until (timestamp with time zone), share_token (uuid), emergency_status (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.rides (51 colonnes)
id (uuid), client_id (uuid), driver_id (uuid), vehicle_id (uuid), status (USER-DEFINED), pickup_address (text), pickup_lat (double precision), pickup_lng (double precision), destination_address (text), destination_lat (double precision), destination_lng (double precision), pickup_country_code (text), pickup_country_name (text), destination_country_code (text), destination_country_name (text), requested_vehicle_type (text), estimated_distance_km (numeric), estimated_duration_min (integer), estimated_price (numeric), standard_price (numeric), customer_proposed_price (numeric), agreed_price (numeric), final_price (numeric), currency (text), payment_method (text), payment_state (text), payment_method_id (uuid), payment_due_amount (numeric), payment_authorized_at (timestamp with time zone), payment_confirmed_at (timestamp with time zone), payment_provider_reference (text), pricing_mode (text), optimized_route_polyline (text), traffic_duration_min (integer), eta_model_version (text), driver_eta_min (integer), dispatch_score (numeric), dispatch_attempts (integer), pickup_confirmed (boolean), destination_confirmed (boolean), cancellation_reason (text), cancellation_note (text), cancelled_by_role (text), cancelled_by (uuid), requested_at (timestamp with time zone), accepted_at (timestamp with time zone), started_at (timestamp with time zone), completed_at (timestamp with time zone), cancelled_at (timestamp with time zone), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.saved_places (9 colonnes)
id (uuid), user_id (uuid), label (text), address (text), latitude (double precision), longitude (double precision), place_type (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.vehicles (12 colonnes)
id (uuid), driver_id (uuid), make (text), model (text), color (text), plate_number (text), seats (integer), vehicle_type (text), photo_path (text), is_active (boolean), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### public.wallet_transactions (9 colonnes)
id (uuid), user_id (uuid), payment_id (uuid), tx_type (USER-DEFINED), amount (numeric), currency (text), balance_after (numeric), description (text), created_at (timestamp with time zone)

### public.wallets (5 colonnes)
user_id (uuid), balance (numeric), currency (text), created_at (timestamp with time zone), updated_at (timestamp with time zone)

### site_watch.checks (8 colonnes)
id (bigint), target_key (text), request_id (bigint), started_at (timestamp with time zone), finished_at (timestamp with time zone), state (text), http_status (integer), error_msg (text)

### site_watch.incidents (9 colonnes)
id (bigint), target_key (text), status (text), first_seen (timestamp with time zone), last_seen (timestamp with time zone), resolved_at (timestamp with time zone), failure_count (integer), http_status (integer), details (text)

### site_watch.targets (5 colonnes)
key (text), label (text), url (text), enabled (boolean), created_at (timestamp with time zone)

## Modes d'accès permis
- Consultation de l'arborescence source, inspection des fichiers autorisés et résultats CI.
- Statistiques agrégées du projet, limitées aux données autorisées aux agents.
- Diagnostic des incidents et rédaction de correctifs non destructifs sous contrôles techniques.
- Administration Vercel par maintenance connectée uniquement : accès direct individuel non garanti.
- La présence d'un fichier ou d'une table dans cet atlas ne prouve pas qu'un agent peut voir ses enregistrements sensibles.

## Tests et fraîcheur
Les demandes de contrôle doivent comparer le SHA de la branche à tester aux résultats GitHub Actions. Un ancien succès ne valide pas le dernier commit.

_Généré automatiquement depuis les métadonnées accessibles, sans exécuter ni publier de code applicatif._