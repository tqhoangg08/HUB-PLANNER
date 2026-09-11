-- Additive cutover: existing IDs, timestamps and visibility remain untouched.
ALTER TABLE school_announcements ADD COLUMN updated_at TEXT;
CREATE INDEX school_announcements_date_idx ON school_announcements(date DESC);
CREATE TABLE announcement_id_sequence (singleton INTEGER PRIMARY KEY CHECK(singleton=1), last_id INTEGER NOT NULL);
INSERT INTO announcement_id_sequence SELECT 1, COALESCE(MAX(id),0) FROM school_announcements;
CREATE TRIGGER announcement_id_high_watermark AFTER INSERT ON school_announcements BEGIN
 UPDATE announcement_id_sequence SET last_id=MAX(last_id,NEW.id) WHERE singleton=1;
END;

-- Seed the public paging counters once. Crawler runs update these through
-- triggers rather than scanning the table after every source/chunk.
INSERT INTO sync_metadata(resource, source_row_count, visible_row_count, synced_at, source_max_created_at)
SELECT 'school_announcements', COUNT(*), COALESCE(SUM(is_hidden = 0), 0),
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), MAX(created_at)
FROM school_announcements WHERE true
ON CONFLICT(resource) DO UPDATE SET source_row_count=excluded.source_row_count,
 visible_row_count=excluded.visible_row_count;

CREATE TRIGGER announcement_metadata_insert AFTER INSERT ON school_announcements BEGIN
 UPDATE sync_metadata SET source_row_count=source_row_count+1,
 visible_row_count=visible_row_count+(NEW.is_hidden=0),
 source_max_created_at=MAX(COALESCE(source_max_created_at,''),COALESCE(NEW.created_at,'')),
 synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE resource='school_announcements';
END;
CREATE TRIGGER announcement_metadata_delete AFTER DELETE ON school_announcements BEGIN
 UPDATE sync_metadata SET source_row_count=source_row_count-1,
 visible_row_count=visible_row_count-(OLD.is_hidden=0),
 synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE resource='school_announcements';
END;
CREATE TRIGGER announcement_metadata_visibility AFTER UPDATE OF is_hidden ON school_announcements
WHEN OLD.is_hidden IS NOT NEW.is_hidden BEGIN
 UPDATE sync_metadata SET visible_row_count=visible_row_count+(NEW.is_hidden=0)-(OLD.is_hidden=0),
 synced_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE resource='school_announcements';
END;
