-- Run this in the Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
-- Project: https://mlrfmahsmjwtcozlxlyo.supabase.co (the one already used by dashboard/index.html)
--
-- Creates/extends the `calendar` table that the Apps Script sync (apps-script/Code.gs)
-- upserts into, and that the dashboard's "LinkedIn Calendar" view reads from live.
--
-- `groups` and `people` already exist and already work (the Feed tab writes to them
-- directly from the browser using the publishable/anon key) -- this file does not
-- touch them.

create table if not exists public.calendar (
  id             text primary key,        -- stable id = "row-<sheet row number>"
  sort_date      text,                    -- YYYY-MM-DD used to place the card on the calendar grid
  target_go_live text,                    -- YYYY-MM-DD, "Target Go-Live" column
  publish_date   text,                    -- YYYY-MM-DD, "Publish date" / "Actual publish date" column
  week_of        text,                    -- YYYY-MM-DD, "Week of" column
  theme          text,
  topic          text,
  working_title  text,
  cta            text,                    -- "CTA / Next step"
  channel        text,
  status         text,                    -- Live / Draft / Idea / Hold / blank
  link           text,                    -- "Link to copy" / "Link to approved copy"
  posting_from   text,                    -- assignee(s), comma-separated as written in the sheet
  repost_to      text,
  notes          text,
  updated_at     timestamptz default now()
);

-- Columns above use "create table if not exists", so if the table already exists from
-- an earlier manual setup, make sure every column is present:
alter table public.calendar add column if not exists sort_date text;
alter table public.calendar add column if not exists target_go_live text;
alter table public.calendar add column if not exists publish_date text;
alter table public.calendar add column if not exists week_of text;
alter table public.calendar add column if not exists theme text;
alter table public.calendar add column if not exists topic text;
alter table public.calendar add column if not exists working_title text;
alter table public.calendar add column if not exists cta text;
alter table public.calendar add column if not exists channel text;
alter table public.calendar add column if not exists status text;
alter table public.calendar add column if not exists link text;
alter table public.calendar add column if not exists posting_from text;
alter table public.calendar add column if not exists repost_to text;
alter table public.calendar add column if not exists notes text;
alter table public.calendar add column if not exists updated_at timestamptz default now();

-- RLS: the dashboard reads this table with the public/anon key, so SELECT must stay
-- open. Writes should only ever come from the Apps Script sync, which uses the
-- service_role key (that key bypasses RLS entirely) -- so no insert/update/delete
-- policy is granted to anon/authenticated here. That keeps the calendar read-only
-- from the browser even though `people`/`groups` are writable from it.
alter table public.calendar enable row level security;

drop policy if exists "calendar_public_read" on public.calendar;
create policy "calendar_public_read"
  on public.calendar for select
  to anon, authenticated
  using (true);

-- Rows that disappear from the sheet (deleted/moved) should disappear from the
-- dashboard too. The sync script deletes rows out-of-range on every full sync,
-- so no extra trigger is needed here.
