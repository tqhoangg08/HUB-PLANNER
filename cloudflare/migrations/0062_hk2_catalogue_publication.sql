-- CLOSED by default. Deliberately no view/trigger/FK referencing the catalogue:
-- the #160 importer's pinned catalogue schema must remain byte-for-byte intact.
CREATE TABLE hk2_catalogue_publication_receipts (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action = 'OPEN_HK2_2026_2027'),
  verification_sha256 TEXT NOT NULL CHECK (length(verification_sha256) = 64),
  backup_restore_sha256 TEXT NOT NULL CHECK (length(backup_restore_sha256) = 64),
  owner_id INTEGER NOT NULL CHECK (owner_id = 252552483),
  owner_comment_id INTEGER NOT NULL CHECK (owner_comment_id > 0),
  release_sha TEXT NOT NULL CHECK (length(release_sha) = 40),
  import_ledger_json TEXT NOT NULL CHECK (json_valid(import_ledger_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE hk2_catalogue_publications (
  semester TEXT PRIMARY KEY CHECK (semester = 'HK2_2026_2027'),
  state TEXT NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED','OPEN')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision IN (0,1)),
  manifest_sha256 TEXT,
  payload_sha256 TEXT,
  official_count INTEGER,
  batch_count INTEGER,
  verification_sha256 TEXT,
  receipt_id TEXT REFERENCES hk2_catalogue_publication_receipts(id),
  opened_at TEXT,
  CHECK (state = 'CLOSED' OR (
    revision = 1 AND manifest_sha256 IS NOT NULL AND payload_sha256 IS NOT NULL
    AND official_count = 2357 AND batch_count = 95 AND verification_sha256 IS NOT NULL
    AND receipt_id IS NOT NULL AND opened_at IS NOT NULL
  ))
);
INSERT INTO hk2_catalogue_publications(semester,state,revision) VALUES('HK2_2026_2027','CLOSED',0);
