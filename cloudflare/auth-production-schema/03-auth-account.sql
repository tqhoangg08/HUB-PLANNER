PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "auth_account" ("id" text not null primary key, "account_id" text not null, "provider_id" text not null, "user_id" text not null references "auth_user" ("id") on delete cascade, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" date, "refresh_token_expires_at" date, "scope" text, "password" text, "created_at" date not null, "updated_at" date not null);

