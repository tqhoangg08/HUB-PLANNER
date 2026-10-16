-- Additive upgrade from 0055. Legacy rows are retained, but are never published
-- without a reviewed snapshot. No inferred GPA/DRL scale for source-specific scores.
ALTER TABLE scholarship_campaigns ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scholarship_campaigns ADD COLUMN candidate_batch_id TEXT REFERENCES scholarship_import_batches(id);
ALTER TABLE scholarship_campaigns ADD COLUMN active_batch_id TEXT REFERENCES scholarship_import_batches(id);
ALTER TABLE scholarship_import_batches ADD COLUMN mapping_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE scholarship_import_batches ADD COLUMN payload_sha256 TEXT;
ALTER TABLE scholarship_import_batches ADD COLUMN approved_fields_json TEXT;
ALTER TABLE scholarship_import_batches ADD COLUMN approval_document_json TEXT;
ALTER TABLE scholarship_import_batches ADD COLUMN approved_by TEXT;
ALTER TABLE scholarship_import_batches ADD COLUMN approved_at TEXT;

CREATE UNIQUE INDEX scholarship_batch_payload_idx
  ON scholarship_import_batches(campaign_slug, source_sha256, payload_sha256);

CREATE TABLE scholarship_snapshot_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL REFERENCES scholarship_import_batches(id) ON DELETE RESTRICT,
  source_row_number INTEGER NOT NULL CHECK(source_row_number > 0),
  source_identifier TEXT,
  student_code TEXT NOT NULL CHECK(length(student_code)=12 AND student_code NOT GLOB '*[^0-9]*'),
  full_name TEXT NOT NULL,
  full_name_search TEXT NOT NULL,
  class_name TEXT,
  major TEXT,
  award_type TEXT NOT NULL,
  scores_json TEXT NOT NULL CHECK(json_valid(scores_json)),
  source_row_sha256 TEXT NOT NULL,
  UNIQUE(batch_id, source_row_number)
);
CREATE INDEX scholarship_snapshot_code_idx ON scholarship_snapshot_rows(batch_id, student_code);
CREATE INDEX scholarship_snapshot_name_idx ON scholarship_snapshot_rows(batch_id, full_name_search);
CREATE INDEX scholarship_snapshot_award_idx ON scholarship_snapshot_rows(batch_id, award_type);

-- Once applied, neither approval nor publication may mutate recipient content.
CREATE TRIGGER scholarship_snapshot_insert_immutable BEFORE INSERT ON scholarship_snapshot_rows
  WHEN (SELECT status FROM scholarship_import_batches WHERE id=NEW.batch_id)='applied'
  BEGIN SELECT RAISE(ABORT, 'SCHOLARSHIP_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER scholarship_snapshot_update_immutable BEFORE UPDATE ON scholarship_snapshot_rows
  WHEN (SELECT status FROM scholarship_import_batches WHERE id=OLD.batch_id)='applied'
    OR (SELECT status FROM scholarship_import_batches WHERE id=NEW.batch_id)='applied'
  BEGIN SELECT RAISE(ABORT, 'SCHOLARSHIP_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER scholarship_snapshot_delete_immutable BEFORE DELETE ON scholarship_snapshot_rows
  WHEN (SELECT status FROM scholarship_import_batches WHERE id=OLD.batch_id)='applied'
  BEGIN SELECT RAISE(ABORT, 'SCHOLARSHIP_SNAPSHOT_IMMUTABLE'); END;

CREATE TABLE scholarship_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_slug TEXT NOT NULL REFERENCES scholarship_campaigns(slug),
  batch_id TEXT REFERENCES scholarship_import_batches(id),
  action TEXT NOT NULL CHECK(action IN ('created','updated','previewed','applied','approved','published','unpublished','rollback','archived')),
  performed_by_user_id TEXT NOT NULL,
  source_sha256 TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
-- D1 batch() is transactional. This constraint turns a failed compare-and-swap
-- into a transaction failure, so rows, pointers and audit entries all roll back.
CREATE TABLE scholarship_transaction_guard (ok INTEGER NOT NULL CHECK(ok=1));
