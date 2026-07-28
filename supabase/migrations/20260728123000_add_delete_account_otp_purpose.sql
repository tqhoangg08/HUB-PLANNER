alter table public.auth_otp_codes
  drop constraint if exists auth_otp_codes_purpose_check;

alter table public.auth_otp_codes
  add constraint auth_otp_codes_purpose_check
  check (purpose in ('register', 'forgot_password', 'admin_export', 'delete_data'));
