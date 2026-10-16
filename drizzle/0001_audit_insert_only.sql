-- audit_event is append-only: application code may INSERT, never UPDATE or DELETE.
-- (TRUNCATE is deliberately not blocked so local/test resets stay possible.)
CREATE FUNCTION audit_event_reject_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only (% rejected)', TG_OP USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION audit_event_reject_change();
