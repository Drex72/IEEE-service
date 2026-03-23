create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  name text not null,
  website text,
  industry text,
  tier text,
  contact_email text,
  contact_details text,
  phone_or_address text,
  reach_channel text,
  notes text,
  status text default 'Not Sent',
  source_row integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint companies_owner_key_name_key unique (owner_key, name)
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  subject text not null,
  preview_line text,
  content_markdown text not null,
  content_html text,
  generated_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_templates_owner_key_company_id_key unique (owner_key, company_id)
);

create table if not exists public.gmail_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null unique,
  email text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expiry timestamptz,
  scope text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid references public.email_templates(id) on delete set null,
  recipient_email text not null,
  status text not null,
  gmail_message_id text,
  error_message text,
  sent_at timestamptz not null default timezone('utc', now())
);

create index if not exists companies_owner_key_idx on public.companies (owner_key);
create index if not exists email_templates_owner_key_idx on public.email_templates (owner_key);
create index if not exists email_logs_owner_key_idx on public.email_logs (owner_key);
create index if not exists email_logs_company_id_idx on public.email_logs (company_id);

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at
before update on public.companies
for each row
execute function public.touch_updated_at();

drop trigger if exists email_templates_touch_updated_at on public.email_templates;
create trigger email_templates_touch_updated_at
before update on public.email_templates
for each row
execute function public.touch_updated_at();

drop trigger if exists gmail_accounts_touch_updated_at on public.gmail_accounts;
create trigger gmail_accounts_touch_updated_at
before update on public.gmail_accounts
for each row
execute function public.touch_updated_at();

