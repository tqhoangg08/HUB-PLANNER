PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE app_auth_identifiers (
        student_code TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );

