ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.profiles.avatar_url IS
'Avatar color hex or public image URL. Uploaded images are stored outside Supabase and referenced here.';
