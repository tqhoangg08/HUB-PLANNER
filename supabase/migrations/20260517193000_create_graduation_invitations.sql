create table if not exists public.graduation_invitation_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  slug text unique,
  template_id text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  theme_config jsonb not null default '{}'::jsonb,
  layout_style text not null default 'garden',
  sections jsonb not null default '{}'::jsonb,
  section_order text[] not null default array[]::text[],
  design_elements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.graduation_invitation_rsvps (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.graduation_invitation_projects(id) on delete cascade,
  name text not null,
  phone_or_email text,
  status text not null check (status in ('attending', 'maybe', 'declined')),
  guest_count integer not null default 1 check (guest_count >= 0),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists graduation_invitation_projects_user_id_idx
  on public.graduation_invitation_projects(user_id);

create index if not exists graduation_invitation_projects_slug_idx
  on public.graduation_invitation_projects(slug)
  where status = 'published';

create index if not exists graduation_invitation_rsvps_invitation_id_idx
  on public.graduation_invitation_rsvps(invitation_id);

alter table public.graduation_invitation_projects enable row level security;
alter table public.graduation_invitation_rsvps enable row level security;

drop policy if exists "Owners can manage graduation invitation projects" on public.graduation_invitation_projects;
create policy "Owners can manage graduation invitation projects"
  on public.graduation_invitation_projects
  for all
  using (auth.uid() = user_id or user_id is null)
  with check (auth.uid() = user_id or user_id is null);

drop policy if exists "Anyone can view published graduation invitations" on public.graduation_invitation_projects;
create policy "Anyone can view published graduation invitations"
  on public.graduation_invitation_projects
  for select
  using (status = 'published');

drop policy if exists "Anyone can submit graduation invitation RSVP" on public.graduation_invitation_rsvps;
create policy "Anyone can submit graduation invitation RSVP"
  on public.graduation_invitation_rsvps
  for insert
  with check (
    exists (
      select 1
      from public.graduation_invitation_projects p
      where p.id = invitation_id
        and p.status = 'published'
    )
  );

drop policy if exists "Invitation owners can view RSVP" on public.graduation_invitation_rsvps;
create policy "Invitation owners can view RSVP"
  on public.graduation_invitation_rsvps
  for select
  using (
    exists (
      select 1
      from public.graduation_invitation_projects p
      where p.id = invitation_id
        and (p.user_id = auth.uid() or p.user_id is null)
    )
  );
