drop policy if exists "Service role manages auth otp codes" on public.auth_otp_codes;

create policy "Service role manages auth otp codes"
on public.auth_otp_codes
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

drop policy if exists "Allow read access for authenticated users" on public.bug_reports;

create policy "Allow read access for authenticated users"
on public.bug_reports
for select
using ((select auth.role()) = 'authenticated');

drop policy if exists "Users and admins can read subscriptions" on public.subscriptions;

create policy "Users and admins can read subscriptions"
on public.subscriptions
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_subscription_admin());
