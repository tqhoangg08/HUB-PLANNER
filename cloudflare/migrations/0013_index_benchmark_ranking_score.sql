ALTER TABLE benchmark_ranking_buckets
  ADD COLUMN score_key INTEGER;

CREATE INDEX IF NOT EXISTS benchmark_ranking_buckets_score_idx
  ON benchmark_ranking_buckets (
    semester,
    scope_type,
    scope_value,
    score_key DESC
  );
