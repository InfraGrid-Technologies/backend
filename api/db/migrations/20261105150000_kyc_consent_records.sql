-- User consent tracking and audit table for DPDP Act 2023 & RBI compliance
begin;

create schema if not exists kyc;

-- 1. Consent artifacts table
create table if not exists kyc.consents (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null, -- User/Operator giving consent
  consent_type text not null check (consent_type in ('driving_license', 'bank_account', 'rc', 'aadhaar', 'challan')),
  purpose text not null default 'IDENTITY_AND_COMPLIANCE_VERIFICATION',
  notice_version text not null, -- e.g. 'DL_CONSENT_V1.0'
  notice_text text not null, -- snapshot of the legal text shown to user
  ip_address text not null,
  user_agent text null,
  status text not null default 'GRANTED' check (status in ('GRANTED', 'REVOKED')),
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz null
);

create index if not exists idx_kyc_consents_actor on kyc.consents (actor_id, consent_type);
create index if not exists idx_kyc_consents_granted_at on kyc.consents (granted_at desc);

-- 2. Link consent_id to kyc.verifications table
alter table kyc.verifications 
  add column if not exists consent_id uuid null references kyc.consents(id) on delete set null;

-- 3. Grants for application roles
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

