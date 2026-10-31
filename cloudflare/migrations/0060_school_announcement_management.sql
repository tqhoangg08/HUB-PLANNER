-- Additive management metadata. Existing crawler columns and push flags remain intact.
ALTER TABLE school_announcements ADD COLUMN department TEXT NOT NULL DEFAULT '';
ALTER TABLE school_announcements ADD COLUMN department_search TEXT NOT NULL DEFAULT '';
ALTER TABLE school_announcements ADD COLUMN is_highlighted INTEGER NOT NULL DEFAULT 0 CHECK(is_highlighted IN (0,1));
ALTER TABLE school_announcements ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0 CHECK(is_deleted IN (0,1));
ALTER TABLE school_announcements ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'crawler' CHECK(source_kind IN ('crawler','manual'));
ALTER TABLE school_announcements ADD COLUMN admin_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE school_announcements ADD COLUMN content_overridden INTEGER NOT NULL DEFAULT 0 CHECK(content_overridden IN (0,1));
ALTER TABLE school_announcements ADD COLUMN crawler_title_search TEXT;
CREATE INDEX school_announcements_admin_order ON school_announcements(is_deleted,date DESC,id DESC);
CREATE INDEX school_announcements_crawler_title ON school_announcements(crawler_title_search);
-- A deleted notice remains a hidden tombstone, preserving crawler dedupe and push history.
CREATE TRIGGER school_announcements_deleted_visibility BEFORE UPDATE ON school_announcements
WHEN NEW.is_deleted=1 AND NEW.is_hidden!=1 BEGIN SELECT RAISE(ABORT,'deleted_announcement_must_be_hidden'); END;
CREATE TRIGGER school_announcements_deleted_insert BEFORE INSERT ON school_announcements
WHEN NEW.is_deleted=1 AND NEW.is_hidden!=1 BEGIN SELECT RAISE(ABORT,'deleted_announcement_must_be_hidden'); END;

-- The source URL is the crawler's immutable identity/dedupe key.
CREATE TRIGGER school_announcements_crawler_identity BEFORE UPDATE OF link ON school_announcements
WHEN OLD.source_kind='crawler' AND NEW.link IS NOT OLD.link
BEGIN SELECT RAISE(ABORT,'crawler_source_url_is_immutable'); END;

-- Protect explicit admin corrections, including from an older in-flight
-- crawler workflow. Admin writes always advance admin_revision atomically.
CREATE TRIGGER school_announcements_content_owner BEFORE UPDATE OF title,title_search,date ON school_announcements
WHEN (OLD.content_overridden=1 OR OLD.source_kind='manual') AND NEW.admin_revision=OLD.admin_revision
BEGIN
 UPDATE school_announcements SET crawler_title_search=NEW.title_search
 WHERE id=OLD.id AND crawler_title_search IS NOT NEW.title_search;
 SELECT RAISE(IGNORE);
END;

-- Preserve title-alias dedupe when an admin corrects the displayed title.
-- The unchanged crawler INSERT predicate still dedupes the displayed title;
-- this guard also covers the original/latest upstream title.
CREATE TRIGGER school_announcements_capture_source_title AFTER UPDATE OF title ON school_announcements
WHEN OLD.source_kind='crawler' AND NEW.admin_revision!=OLD.admin_revision
 AND NEW.title IS NOT OLD.title AND OLD.crawler_title_search IS NULL
BEGIN UPDATE school_announcements SET crawler_title_search=OLD.title_search WHERE id=NEW.id; END;
CREATE TRIGGER school_announcements_source_title_dedupe BEFORE INSERT ON school_announcements
WHEN NEW.source_kind='crawler' AND EXISTS(SELECT 1 FROM school_announcements WHERE crawler_title_search=NEW.title_search)
BEGIN SELECT RAISE(IGNORE); END;

-- An upstream edit invalidates an open form as well as an admin edit does.
CREATE TRIGGER school_announcements_crawler_revision AFTER UPDATE OF title,title_search,date ON school_announcements
WHEN NEW.admin_revision=OLD.admin_revision AND
 (NEW.title IS NOT OLD.title OR NEW.title_search IS NOT OLD.title_search OR NEW.date IS NOT OLD.date)
BEGIN UPDATE school_announcements SET admin_revision=admin_revision+1 WHERE id=NEW.id; END;

-- Visibility and pending cancellation commit in the same statement, so a
-- failed/interrupted API response cannot leave a hidden notice deliverable.
CREATE TRIGGER school_announcements_hide_push AFTER UPDATE OF is_hidden ON school_announcements
WHEN NEW.is_hidden=1 AND OLD.is_hidden!=1
BEGIN
 UPDATE school_announcement_push_queue
 SET failed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_error='ANNOUNCEMENT_HIDDEN'
 WHERE announcement_id=NEW.id AND sent_at IS NULL AND failed_at IS NULL;
END;
