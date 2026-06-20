alter table public.canva_pro_requests
  drop constraint if exists canva_pro_requests_email_check;

alter table public.canva_pro_requests
  add constraint canva_pro_requests_email_check
  check (lower(btrim(email)) like '%@st.buh.edu.vn');
