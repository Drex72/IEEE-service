create table if not exists public.campaign_profiles (
  owner_key text primary key,
  brief text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.companies
add column if not exists campaign_context_override text;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid references public.email_templates(id) on delete set null,
  trigger text,
  status text not null default 'queued',
  progress_percent integer not null default 0,
  current_step text,
  campaign_context text,
  error_message text,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid references public.companies(id) on delete set null,
  generation_job_id uuid references public.generation_jobs(id) on delete set null,
  title text not null,
  message text not null,
  level text not null default 'info',
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz
);

create index if not exists campaign_profiles_owner_key_idx
  on public.campaign_profiles (owner_key);

create index if not exists generation_jobs_owner_key_idx
  on public.generation_jobs (owner_key);

create index if not exists generation_jobs_company_id_idx
  on public.generation_jobs (company_id);

create index if not exists generation_jobs_owner_key_status_idx
  on public.generation_jobs (owner_key, status);

create index if not exists generation_jobs_owner_key_company_id_idx
  on public.generation_jobs (owner_key, company_id);

create index if not exists notifications_owner_key_idx
  on public.notifications (owner_key);

create index if not exists notifications_owner_key_created_at_idx
  on public.notifications (owner_key, created_at desc);

drop trigger if exists campaign_profiles_touch_updated_at on public.campaign_profiles;
create trigger campaign_profiles_touch_updated_at
before update on public.campaign_profiles
for each row
execute function public.touch_updated_at();

drop trigger if exists generation_jobs_touch_updated_at on public.generation_jobs;
create trigger generation_jobs_touch_updated_at
before update on public.generation_jobs
for each row
execute function public.touch_updated_at();
