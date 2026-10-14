-- No backfill: legacy award_type is not proof of either program or rank.
ALTER TABLE scholarship_snapshot_rows ADD COLUMN scholarship_type TEXT;
ALTER TABLE scholarship_snapshot_rows ADD COLUMN scholarship_rank TEXT;
ALTER TABLE scholarship_snapshot_rows ADD COLUMN cohort TEXT;
CREATE INDEX scholarship_snapshot_type_idx ON scholarship_snapshot_rows(batch_id, scholarship_type);
CREATE INDEX scholarship_snapshot_rank_idx ON scholarship_snapshot_rows(batch_id, scholarship_rank);
CREATE INDEX scholarship_snapshot_major_idx ON scholarship_snapshot_rows(batch_id, major);
CREATE INDEX scholarship_snapshot_class_idx ON scholarship_snapshot_rows(batch_id, class_name);
CREATE INDEX scholarship_snapshot_cohort_major_idx ON scholarship_snapshot_rows(batch_id, cohort, major, class_name);
