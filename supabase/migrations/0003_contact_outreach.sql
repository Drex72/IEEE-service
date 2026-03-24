create table if not exists public.company_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  external_key text not null,
  full_name text,
  role_title text,
  email text,
  linkedin_url text,
  raw_contact text,
  phone_or_address text,
  reach_channel text,
  notes text,
  source_row integer,
  metadata jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_contacts_owner_company_external_key_key unique (owner_key, company_id, external_key)
);

create table if not exists public.contact_outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.company_contacts(id) on delete cascade,
  channel text not null,
  subject text,
  preview_line text,
  content_markdown text not null,
  content_html text,
  generated_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint contact_outreach_drafts_owner_contact_channel_key unique (owner_key, contact_id, channel)
);

alter table public.email_logs
add column if not exists contact_id uuid references public.company_contacts(id) on delete set null;

alter table public.email_logs
add column if not exists draft_id uuid references public.contact_outreach_drafts(id) on delete set null;

create index if not exists company_contacts_owner_key_idx
  on public.company_contacts (owner_key);

create index if not exists company_contacts_company_id_idx
  on public.company_contacts (company_id);

create index if not exists company_contacts_owner_company_idx
  on public.company_contacts (owner_key, company_id);

create index if not exists contact_outreach_drafts_owner_key_idx
  on public.contact_outreach_drafts (owner_key);

create index if not exists contact_outreach_drafts_company_id_idx
  on public.contact_outreach_drafts (company_id);

create index if not exists contact_outreach_drafts_contact_id_idx
  on public.contact_outreach_drafts (contact_id);

create index if not exists contact_outreach_drafts_owner_company_idx
  on public.contact_outreach_drafts (owner_key, company_id);

create index if not exists email_logs_contact_id_idx
  on public.email_logs (contact_id);

create index if not exists email_logs_draft_id_idx
  on public.email_logs (draft_id);

drop trigger if exists company_contacts_touch_updated_at on public.company_contacts;
create trigger company_contacts_touch_updated_at
before update on public.company_contacts
for each row
execute function public.touch_updated_at();

drop trigger if exists contact_outreach_drafts_touch_updated_at on public.contact_outreach_drafts;
create trigger contact_outreach_drafts_touch_updated_at
before update on public.contact_outreach_drafts
for each row
execute function public.touch_updated_at();

insert into public.company_contacts (
  owner_key,
  company_id,
  external_key,
  full_name,
  email,
  raw_contact,
  phone_or_address,
  reach_channel,
  notes,
  source_row,
  metadata,
  is_primary
)
select
  companies.owner_key,
  companies.id,
  coalesce('legacy-row-' || companies.source_row::text, 'legacy-company-' || companies.id::text),
  nullif(companies.contact_details, ''),
  nullif(companies.contact_email, ''),
  nullif(companies.contact_details, ''),
  companies.phone_or_address,
  companies.reach_channel,
  companies.notes,
  companies.source_row,
  companies.metadata,
  true
from public.companies
where companies.contact_details is not null
   or companies.contact_email is not null
on conflict (owner_key, company_id, external_key) do nothing;
