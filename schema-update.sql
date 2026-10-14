-- ============================================================
-- Schema update — run in Supabase SQL Editor AFTER schema.sql
-- Adds: link health tracking, archived status
-- ============================================================

-- ── Add link health columns ───────────────────────────────
alter table public.resources
  add column if not exists link_status      text default 'unchecked'
    check (link_status in ('unchecked', 'ok', 'broken', 'redirect', 'timeout')),
  add column if not exists link_checked_at  timestamptz;

-- ── Add 'archived' to status enum ────────────────────────
-- Drop and recreate the status check constraint
alter table public.resources
  drop constraint if exists resources_status_check;

alter table public.resources
  add constraint resources_status_check
    check (status in ('pending', 'approved', 'rejected', 'archived'));

-- ── Public can no longer see archived resources ───────────
-- The existing "Public can view approved resources" policy already
-- excludes archived (status = 'approved' only), so no change needed.

-- ── Admins can archive (update any resource already covered) ──
-- Already covered by "Admins can update all resources" policy.

-- ── Index for faster link health queries ─────────────────
create index if not exists resources_link_status_idx
  on public.resources (link_status)
  where link is not null;
