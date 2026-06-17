drop policy if exists "practice_sets_public_select" on public.practice_sets;
create policy "practice_sets_public_select" on public.practice_sets
  for select using (visibility in ('public', 'pro') or (select auth.uid()) = owner_id);

drop policy if exists "practice_sets_owner_insert" on public.practice_sets;
create policy "practice_sets_owner_insert" on public.practice_sets
  for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "practice_sets_owner_update" on public.practice_sets;
create policy "practice_sets_owner_update" on public.practice_sets
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "practice_sets_owner_delete" on public.practice_sets;
create policy "practice_sets_owner_delete" on public.practice_sets
  for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "practice_attempts_owner_select" on public.practice_attempts;
create policy "practice_attempts_owner_select" on public.practice_attempts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "practice_attempts_owner_insert" on public.practice_attempts;
create policy "practice_attempts_owner_insert" on public.practice_attempts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "practice_pro_access_owner_select" on public.practice_pro_access;
create policy "practice_pro_access_owner_select" on public.practice_pro_access
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "practice_attempt_answers_owner_select" on public.practice_attempt_answers;
create policy "practice_attempt_answers_owner_select" on public.practice_attempt_answers
  for select to authenticated using (
    exists (
      select 1
      from public.practice_attempts a
      where a.id = practice_attempt_answers.attempt_id
        and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "practice_attempt_answers_owner_insert" on public.practice_attempt_answers;
create policy "practice_attempt_answers_owner_insert" on public.practice_attempt_answers
  for insert to authenticated with check (
    exists (
      select 1
      from public.practice_attempts a
      where a.id = practice_attempt_answers.attempt_id
        and a.user_id = (select auth.uid())
    )
  );
