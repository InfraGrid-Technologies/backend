-- KYC verification cache and audit tables to prevent duplicate API cost and track vendor requests.
begin;

create schema if not exists kyc;

-- 1. Main verification records table (Acts as our local cache to save ₹15 per duplicate check)
create table if not exists kyc.verifications (
  id uuid primary key default gen_random_uuid(),
  verification_type text not null check (verification_type in ('driving_license', 'bank_account', 'rc', 'aadhaar', 'challan')),
  id_number text not null, -- DL number, Account number, RC number, or Digilocker Client ID
  status text not null check (status in ('verified', 'failed', 'pending')),
  provider text not null, -- 'mock', 'surepass', etc.
  response_data jsonb not null default '{}'::jsonb, -- Clean normalized verification data
  raw_provider_response jsonb null, -- Raw vendor JSON for audit
  actor_id uuid null, -- User/operator who requested the verification
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Fast index for cache lookups: quickly find if an ID was already verified within 30 days
create index if not exists idx_kyc_verifications_cache 
  on kyc.verifications (verification_type, id_number, created_at desc);

-- 2. Audit log of every external API call made to the provider (Tracks exact credits used and errors)
create table if not exists kyc.api_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  http_status integer not null,
  cost_estimate numeric(10, 2) default 0.00,
  request_payload jsonb null,
  response_payload jsonb null,
  created_at timestamptz not null default clock_timestamp()
);

-- 3. Access grants for the application runtime role
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema kyc to service_role;
    grant all on all tables in schema kyc to service_role;
    grant all on all sequences in schema kyc to service_role;
  end if;

  if exists (select 1 from pg_roles where rolname = 'equiprent_api') then
    grant usage on schema kyc to equiprent_api;
    grant all on all tables in schema kyc to equiprent_api;
    grant all on all sequences in schema kyc to equiprent_api;
  end if;
end $$;

commit;

