-- Preserve existing requests while making future student course requests carry
-- canonical, structured schedule sessions.  Legacy rows deliberately default
-- to an empty array and remain reviewable; only new writes require sessions.
ALTER TABLE user_course_requests
  ADD COLUMN schedule_details_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(schedule_details_json) AND json_type(schedule_details_json) = 'array');
