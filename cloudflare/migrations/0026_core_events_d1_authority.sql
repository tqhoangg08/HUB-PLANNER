-- Additive allocator for canonical core-event IDs after D1 becomes the write authority.
-- Gaps are harmless; the singleton update is atomic and prevents concurrent duplicates.
CREATE TABLE IF NOT EXISTS core_event_id_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  next_id INTEGER NOT NULL CHECK (next_id > 0)
);

INSERT OR IGNORE INTO core_event_id_sequence (singleton, next_id)
SELECT
  1,
  MAX(max_id) + 1
FROM (
  SELECT COALESCE(MAX(id), 0) AS max_id FROM admin_events
  UNION ALL
  SELECT COALESCE(MAX(id), 0) AS max_id FROM public_events
);

CREATE TRIGGER IF NOT EXISTS admin_events_advance_core_event_sequence
AFTER INSERT ON admin_events
WHEN NEW.id >= (SELECT next_id FROM core_event_id_sequence WHERE singleton = 1)
BEGIN
  UPDATE core_event_id_sequence
     SET next_id = NEW.id + 1
   WHERE singleton = 1;
END;

CREATE TRIGGER IF NOT EXISTS public_events_advance_core_event_sequence
AFTER INSERT ON public_events
WHEN NEW.id >= (SELECT next_id FROM core_event_id_sequence WHERE singleton = 1)
BEGIN
  UPDATE core_event_id_sequence
     SET next_id = NEW.id + 1
   WHERE singleton = 1;
END;
