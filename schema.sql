-- ============================================================
-- Cooperative Extension AI Assets — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ── Profiles (extends auth.users) ───────────────────────────
create table public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text,
  full_name   text,
  institution text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── Resources ────────────────────────────────────────────────
create table public.resources (
  id                uuid        default gen_random_uuid() primary key,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Ownership & workflow
  submitted_by      uuid        references auth.users(id) on delete set null,
  status            text        not null default 'pending'
                                check (status in ('pending', 'approved', 'rejected')),
  reviewed_by       uuid        references auth.users(id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text,

  -- Core fields (matching Google Form)
  category          text,
  subcategory       text,
  title             text        not null,
  description       text,
  programs          text[],
  knowledge_level   text[],
  audience          text[],
  contact_person    text,
  institution       text,
  link              text,
  service_area      text,
  notes             text,

  -- Legacy migration metadata
  legacy_email      text,
  legacy_timestamp  timestamptz
);

alter table public.resources enable row level security;

-- Public: read approved only
create policy "Public can view approved resources"
  on resources for select
  using (status = 'approved');

-- Admins: read everything
create policy "Admins can view all resources"
  on resources for select
  using (exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ));

-- Authenticated users: insert (status enforced to 'pending' below)
create policy "Authenticated users can submit"
  on resources for insert
  with check (auth.uid() is not null);

-- Users: update own pending submissions only
create policy "Users can edit own pending resources"
  on resources for update
  using  (submitted_by = auth.uid() and status = 'pending')
  with check (submitted_by = auth.uid() and status = 'pending');

-- Admins: update any resource (for approve/reject/edit)
create policy "Admins can update all resources"
  on resources for update
  using (exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ));

-- Users: delete own pending
create policy "Users can delete own pending resources"
  on resources for delete
  using (submitted_by = auth.uid() and status = 'pending');

-- Admins: delete any
create policy "Admins can delete any resource"
  on resources for delete
  using (exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ));


-- ── updated_at trigger ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger resources_updated_at
  before update on resources
  for each row execute procedure public.set_updated_at();

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure public.set_updated_at();


-- ── Helper: force pending on insert ──────────────────────────
-- Prevents users from submitting with status = 'approved' directly
create or replace function public.enforce_pending_on_insert()
returns trigger language plpgsql as $$
begin
  -- Only admins can insert with a non-pending status (for migration)
  if new.status != 'pending' then
    if not exists (
      select 1 from profiles where id = auth.uid() and role = 'admin'
    ) then
      new.status := 'pending';
    end if;
  end if;
  return new;
end;
$$;

create trigger resources_enforce_pending
  before insert on resources
  for each row execute procedure public.enforce_pending_on_insert();


-- ── Promote first admin ───────────────────────────────────────
-- Run AFTER aaronweibe@extension.org has created their account:
--
--   update public.profiles
--   set role = 'admin'
--   where email = 'aaronweibe@extension.org';
