-- FAST: a document deletion must never leave a previously approved driver active.
CREATE OR REPLACE FUNCTION fast_workflows.guard_document_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $f$
BEGIN
 IF current_user='authenticated' AND OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'FAST_APPROVED_DOCUMENT_DELETE_REQUIRES_ADMIN'
      USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $f$;
CREATE OR REPLACE FUNCTION fast_workflows.revoke_driver_after_document_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $f$
BEGIN
 IF OLD.status='approved' THEN
  UPDATE public.drivers
    SET is_verified=false,
        status=CASE WHEN status='available' THEN 'offline'::public.driver_status ELSE status END,
        updated_at=now()
  WHERE user_id=OLD.driver_id AND (is_verified=true OR status='available');
 END IF;
 RETURN OLD;
END $f$;
DROP TRIGGER IF EXISTS trg_fast_document_delete_guard ON public.driver_documents;
CREATE TRIGGER trg_fast_document_delete_guard BEFORE DELETE ON public.driver_documents
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.guard_document_delete();
DROP TRIGGER IF EXISTS trg_fast_document_delete_revokes ON public.driver_documents;
CREATE TRIGGER trg_fast_document_delete_revokes AFTER DELETE ON public.driver_documents
 FOR EACH ROW EXECUTE FUNCTION fast_workflows.revoke_driver_after_document_delete();
REVOKE ALL ON FUNCTION fast_workflows.guard_document_delete() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fast_workflows.revoke_driver_after_document_delete() FROM PUBLIC,anon,authenticated;
