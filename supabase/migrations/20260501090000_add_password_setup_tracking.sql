ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS password_set_at timestamp with time zone;

UPDATE public.profiles AS profiles
SET password_set_at = COALESCE(profiles.password_set_at, now())
FROM auth.users AS users
WHERE profiles.id = users.id
  AND users.encrypted_password IS NOT NULL
  AND profiles.password_set_at IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF new.email NOT LIKE '%@st.buh.edu.vn' THEN
    RAISE EXCEPTION 'Chỉ chấp nhận email sinh viên HUB (@st.buh.edu.vn)!';
  END IF;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    email,
    student_code,
    password_set_at
  )
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.email,
    split_part(new.email, '@', 1),
    CASE WHEN new.encrypted_password IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
      student_code = COALESCE(public.profiles.student_code, EXCLUDED.student_code),
      password_set_at = COALESCE(public.profiles.password_set_at, EXCLUDED.password_set_at);

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_password_set() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.profiles
  SET password_set_at = now(),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT ALL ON FUNCTION public.mark_password_set() TO authenticated;
