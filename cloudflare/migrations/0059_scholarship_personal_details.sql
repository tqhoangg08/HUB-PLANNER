-- Additive only: existing snapshots and their checksums are unchanged.
ALTER TABLE scholarship_snapshot_rows ADD COLUMN training_program TEXT;
ALTER TABLE scholarship_snapshot_rows ADD COLUMN source_ordinal_json TEXT CHECK (source_ordinal_json IS NULL OR json_valid(source_ordinal_json));
ALTER TABLE scholarship_snapshot_rows ADD COLUMN private_rankings_json TEXT CHECK (private_rankings_json IS NULL OR (json_valid(private_rankings_json) AND json_type(private_rankings_json)='object'));
ALTER TABLE scholarship_import_batches ADD COLUMN source_list_kind TEXT NOT NULL DEFAULT 'unspecified' CHECK (source_list_kind IN ('unspecified','eligibility','award_decision'));
-- NULL is legacy public-safe fallback; [] explicitly grants no own optional fields.
ALTER TABLE scholarship_import_batches ADD COLUMN own_fields_json TEXT CHECK (own_fields_json IS NULL OR (json_valid(own_fields_json) AND json_type(own_fields_json)='array'));
CREATE INDEX scholarship_snapshot_program_idx ON scholarship_snapshot_rows(batch_id, training_program, cohort, major, class_name);
