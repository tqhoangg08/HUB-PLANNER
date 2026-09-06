PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE app_user_roles (
        user_id TEXT PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'admin', 'auditor')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

