-- The comment feature has been removed from the app.
-- This permanently deletes comment-related data and removes the public RPC.

drop function if exists public.submit_secure_comment(text, text, bigint, boolean, text, text);

drop table if exists public.comment_history cascade;
drop table if exists public.comment_likes cascade;
drop table if exists public.comments cascade;
