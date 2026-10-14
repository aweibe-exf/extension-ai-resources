-- ============================================================
-- Fix: profiles privilege escalation + public email exposure
-- Run in Supabase SQL Editor (or: supabase db query --linked -f fix-profiles-rls.sql)
--
-- Problems fixed:
--   1. "Users can update own profile" had no WITH CHECK, so any signed-in
--      user could set their own role = 'admin'.
--   2. "Profiles viewable by everyone" exposed every user's email publicly.
--   3. Admins had no UPDATE policy on profiles (admin role toggle failed).
--   4. anon held INSERT/UPDATE grants on profiles it should never have.
-- ============================================================

begin;

-- ── Helper: admin check that bypasses RLS (avoids policy recursion) ──
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ── Guard: only admins (or trusted server contexts) may change role ──
-- auth.uid() is null for the SQL editor and service-role calls (edge
-- functions, migrate.js). Anonymous browser requests are also null but
-- are blocked by RLS and the revoked grants below.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role is distinct from 'user' and auth.uid() is not null and not public.is_admin() then
      new.role := 'user';
    end if;
  elsif new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only admins can change a user''s role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute procedure public.protect_profile_role();

-- ── Policies ─────────────────────────────────────────────────
drop policy if exists "Profiles viewable by everyone" on public.profiles;
create policy "Users view own profile, admins view all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Admins can update all profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'user');

-- ── Resources: admin policies must use is_admin() ────────────
-- They previously subqueried profiles directly, which would fail for anon
-- (and be filtered by the new profiles SELECT policy).
alter policy "Admins can view all resources"  on public.resources using (public.is_admin());
alter policy "Admins can update all resources" on public.resources using (public.is_admin());
alter policy "Admins can delete any resource"  on public.resources using (public.is_admin());

-- The enforce_pending_on_insert trigger also subqueries profiles
create or replace function public.enforce_pending_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status != 'pending' and not public.is_admin() then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

-- ── Grants: anon should have no write (or read) access to profiles ──
revoke insert, update, delete, select on public.profiles from anon;

commit;
