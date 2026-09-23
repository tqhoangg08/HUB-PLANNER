ALTER TABLE public_events ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0);
ALTER TABLE admin_events ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0);

-- Public reads are authoritative. Keep the administrative copy in sync without
-- an extra read/write round trip when a published event is viewed.
CREATE TRIGGER IF NOT EXISTS public_events_sync_view_count
AFTER UPDATE OF view_count ON public_events
FOR EACH ROW
BEGIN
  UPDATE admin_events SET view_count = NEW.view_count WHERE id = NEW.id;
END;
