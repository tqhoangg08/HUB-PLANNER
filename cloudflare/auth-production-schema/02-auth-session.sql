PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "auth_session" ("id" text not null primary key, "expires_at" date not null, "token" text not null unique, "created_at" date not null, "updated_at" date not null, "ip_address" text, "user_agent" text, "user_id" text not null references "auth_user" ("id") on delete cascade);

