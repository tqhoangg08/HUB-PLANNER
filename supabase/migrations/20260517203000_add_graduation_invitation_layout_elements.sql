alter table public.graduation_invitation_projects
  add column if not exists layout_style text not null default 'garden';

alter table public.graduation_invitation_projects
  add column if not exists design_elements jsonb not null default '[]'::jsonb;
