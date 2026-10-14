-- Additive count. Applied 0044's 1..40 CHECK and legacy rows stay unchanged.
ALTER TABLE ai_documents ADD COLUMN index_segment_count INTEGER
  CHECK (index_segment_count IS NULL OR
    (typeof(index_segment_count) = 'integer' AND index_segment_count BETWEEN 1 AND 128));
