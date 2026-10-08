ALTER TABLE event_candidates ADD COLUMN image_ingest_status TEXT NOT NULL DEFAULT 'manual_required'
  CHECK (image_ingest_status IN ('missing', 'pending', 'stored', 'manual_required', 'failed'));
ALTER TABLE event_candidates ADD COLUMN image_ingest_updated_at TEXT;
ALTER TABLE event_candidates ADD COLUMN image_rights_basis TEXT
  CHECK (image_rights_basis IS NULL OR image_rights_basis IN ('owned', 'licensed', 'permission'));

UPDATE event_candidates SET image_ingest_status='missing'
 WHERE image_url IS NULL OR TRIM(image_url)='';
UPDATE event_candidates SET image_ingest_status='stored'
 WHERE image_url LIKE '%/api/public/v1/event-banners/event-banners/%';
