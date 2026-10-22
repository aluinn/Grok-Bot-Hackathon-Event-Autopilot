-- Event Autopilot: the Supabase table that holds every event and its approved drafts.
-- Run this once in the Supabase SQL editor (or ask Grok Bot to run it through its Supabase connector).
-- Anyone can READ an event only after the lead has published it; nobody can write without the service key.

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,           -- e.g. healthcare-grok-bot-hackathon-2026-12-05
  name         text not null,
  date         date not null,
  start_time   text not null,                  -- "18:00", London time
  end_time     text,
  venue        text,
  description  text,
  hosts        text[] default '{}',
  guest_count  int default 0,
  page_copy    text,                           -- from shared/promo.json
  newsletter   jsonb,                          -- { subject, body }
  posts        jsonb,                          -- { linkedin, whatsapp, discord }
  agenda       jsonb,                          -- guest-facing run sheet: [{ time, what, notes }]
  rsvp_url     text,
  published    boolean not null default false, -- true only after the lead clicks Approve
  page_url     text,                           -- where the public page lives once published
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.events enable row level security;

-- The public (anon key) can only see published events. Drafts stay private.
drop policy if exists "Published events are public" on public.events;
create policy "Published events are public" on public.events
  for select using (published = true);

-- No insert/update/delete policies on purpose: only the service role (server side / Grok Bot's
-- Supabase connector) can write, so a visitor can never change an event.
