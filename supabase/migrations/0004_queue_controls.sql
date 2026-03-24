alter table public.campaign_profiles
add column if not exists queue_paused boolean not null default false;
