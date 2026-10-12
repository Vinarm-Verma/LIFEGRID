-- LIFEGRID production deployment migration
-- Run after the core LIFEGRID schema migration in the Supabase SQL Editor.
-- This enables Supabase Realtime for the records used by the live command center.

begin;

-- Supabase Realtime publishes row changes only for tables included here.
do $$
begin
  begin
    alter publication supabase_realtime add table public.emergencies;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.ambulances;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.hospitals;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.resources;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.emergency_hospital_responses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.lifegrid_dispatch_assignments;
  exception when duplicate_object then null;
  end;
end $$;

create index if not exists idx_emergencies_status_updated
  on public.emergencies(status, updated_at desc);

create index if not exists idx_ambulances_status_location
  on public.ambulances(status, location_updated_at desc);

create index if not exists idx_hospitals_emergency_capacity
  on public.hospitals(emergency_accepting, emergency_beds_available, icu_beds_available);

commit;

-- IMPORTANT:
-- Keep Supabase service_role only on the backend. Never expose it as VITE_*.
-- Configure RLS policies for any table that is directly queried from the browser.
-- LIFEGRID's browser currently uses Supabase Auth + Realtime while operational
-- reads/writes continue through the authenticated FastAPI API.
