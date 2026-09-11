-- Source parity established that every canonical candidate URL is distinct.
-- This closes the concurrent-ingest race while keeping canonical IDs intact.
CREATE UNIQUE INDEX IF NOT EXISTS event_candidates_post_url_unique_idx
  ON event_candidates(post_url);
