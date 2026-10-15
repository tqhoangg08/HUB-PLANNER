-- Additive only. NULL context on existing events/predictions means unverified legacy.
CREATE TABLE IF NOT EXISTS drl_policy_versions (
  policy_version TEXT PRIMARY KEY,
  decision_number TEXT,
  decision_date TEXT,
  first_academic_year INTEGER,
  source_sha256 TEXT,
  source_label TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1))
);
INSERT OR IGNORE INTO drl_policy_versions VALUES
  ('legacy-workbook',NULL,NULL,NULL,NULL,'Lịch sử workbook; nguồn quy chế chưa xác minh',1),
  ('hub-drl-2026-5549-v1','5549/QĐ-ĐHNH','2026-10-02',2026,
   '349c6d508db3271c6c1055ec3f968438966fe49bef445c01c2dc7a78ced7ff21',
   'Quy chế đánh giá kết quả rèn luyện sinh viên.docx — Phụ lục',1);

ALTER TABLE admin_events ADD COLUMN drl_policy_version TEXT REFERENCES drl_policy_versions(policy_version);
ALTER TABLE admin_events ADD COLUMN drl_academic_year TEXT;
ALTER TABLE public_events ADD COLUMN drl_policy_version TEXT REFERENCES drl_policy_versions(policy_version);
ALTER TABLE public_events ADD COLUMN drl_academic_year TEXT;
ALTER TABLE event_drl_prediction_cache ADD COLUMN policy_version TEXT;
ALTER TABLE event_drl_prediction_cache ADD COLUMN rules_fingerprint TEXT;
ALTER TABLE event_candidate_drl_predictions ADD COLUMN policy_version TEXT;
ALTER TABLE event_candidate_drl_predictions ADD COLUMN rules_fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_drl_rules_source_active ON drl_rules(source_version,active,event_suitable);
CREATE INDEX IF NOT EXISTS idx_admin_event_drl_policy ON admin_events(drl_policy_version,drl_academic_year);
CREATE INDEX IF NOT EXISTS idx_public_event_drl_policy ON public_events(drl_policy_version,drl_academic_year);
CREATE INDEX IF NOT EXISTS idx_prediction_policy ON event_drl_prediction_cache(policy_version,source_version);

-- Preserve a prediction snapshot before normal retry/recovery updates it.
CREATE TABLE IF NOT EXISTS event_candidate_drl_prediction_audit (
  audit_id INTEGER PRIMARY KEY,
  candidate_id INTEGER NOT NULL,
  fingerprint TEXT,
  snapshot_json TEXT NOT NULL,
  archived_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidate_drl_audit ON event_candidate_drl_prediction_audit(candidate_id);
CREATE TRIGGER IF NOT EXISTS archive_candidate_drl_prediction BEFORE UPDATE ON event_candidate_drl_predictions
BEGIN
  INSERT INTO event_candidate_drl_prediction_audit(candidate_id,fingerprint,snapshot_json,archived_at)
  VALUES(OLD.candidate_id,OLD.fingerprint,json_object(
    'state',OLD.state,'rule_id',OLD.rule_id,'confidence',OLD.confidence,
    'confidence_label',OLD.confidence_label,'reason_code',OLD.reason_code,
    'historical_support_count',OLD.historical_support_count,'closest_matches_json',OLD.closest_matches_json,
    'policy_version',OLD.policy_version,'rules_fingerprint',OLD.rules_fingerprint,'updated_at',OLD.updated_at),
    strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
