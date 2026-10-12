-- Isolated PR88 staging ONLY. Not in the production migrations directory.
CREATE TABLE IF NOT EXISTS staging_ocr_reviews (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES ai_documents(id),
  source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  base_revision TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)),
  pages_json TEXT NOT NULL CHECK(json_valid(pages_json)),
  draft_hash TEXT NOT NULL CHECK(length(draft_hash)=64),
  sequence INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','indexing','index_failed','indexed','promoted')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  new_revision TEXT,
  derived_hash TEXT,
  promoted_by TEXT,
  promoted_at TEXT,
  CHECK(state='draft' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND new_revision IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS staging_ocr_review_history (
  change_id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id TEXT NOT NULL REFERENCES staging_ocr_reviews(id),
  actor_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  action TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  before_hash TEXT,
  after_hash TEXT NOT NULL,
  before_pages_json TEXT,
  after_pages_json TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS staging_review_created AFTER INSERT ON staging_ocr_reviews
BEGIN
  INSERT INTO staging_ocr_review_history(review_id,actor_id,changed_at,action,source_hash,base_revision,sequence,after_hash,after_pages_json)
  VALUES(NEW.id,NEW.created_by,NEW.updated_at,'draft_created',NEW.source_hash,NEW.base_revision,NEW.sequence,NEW.draft_hash,NEW.pages_json);
END;
CREATE TRIGGER IF NOT EXISTS staging_review_changed AFTER UPDATE ON staging_ocr_reviews
BEGIN
  INSERT INTO staging_ocr_review_history(review_id,actor_id,changed_at,action,source_hash,base_revision,sequence,before_hash,after_hash,before_pages_json,after_pages_json)
  VALUES(NEW.id,NEW.updated_by,NEW.updated_at,CASE WHEN OLD.state=NEW.state THEN 'draft_saved' ELSE NEW.state END,NEW.source_hash,NEW.base_revision,NEW.sequence,OLD.draft_hash,NEW.draft_hash,OLD.pages_json,NEW.pages_json);
END;
CREATE TRIGGER IF NOT EXISTS staging_review_immutable BEFORE UPDATE ON staging_ocr_reviews
WHEN NEW.source_hash<>OLD.source_hash OR NEW.base_revision<>OLD.base_revision OR NEW.base_version<>OLD.base_version
  OR NEW.document_id<>OLD.document_id OR NEW.baseline_json<>OLD.baseline_json OR NEW.created_by<>OLD.created_by
  OR (OLD.state<>'draft' AND (NEW.pages_json<>OLD.pages_json OR NEW.draft_hash<>OLD.draft_hash OR NEW.sequence<>OLD.sequence
    OR NEW.approved_by<>OLD.approved_by OR NEW.approved_at<>OLD.approved_at OR NEW.new_revision<>OLD.new_revision OR NEW.derived_hash<>OLD.derived_hash))
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVIEW_SNAPSHOT'); END;
CREATE TRIGGER IF NOT EXISTS staging_review_no_delete BEFORE DELETE ON staging_ocr_reviews
BEGIN SELECT RAISE(ABORT,'REVIEW_HISTORY_REQUIRED'); END;
CREATE TRIGGER IF NOT EXISTS staging_review_history_no_update BEFORE UPDATE ON staging_ocr_review_history
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
CREATE TRIGGER IF NOT EXISTS staging_review_history_no_delete BEFORE DELETE ON staging_ocr_review_history
BEGIN SELECT RAISE(ABORT,'IMMUTABLE_AUDIT'); END;
