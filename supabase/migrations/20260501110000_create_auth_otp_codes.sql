CREATE TABLE IF NOT EXISTS public.auth_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'forgot_password')),
  otp_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_otp_codes_lookup_idx
  ON public.auth_otp_codes (email, purpose, created_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages auth otp codes"
  ON public.auth_otp_codes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
