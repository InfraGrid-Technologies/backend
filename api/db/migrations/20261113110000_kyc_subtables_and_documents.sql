-- Migration: Add Segregated Sub-Tables and Document Attachment Tables
-- Preserves all existing columns in kyc.verifications and adds domain-specific child tables
begin;

-- =========================================================================
-- STEP 1: Add optional non-breaking metadata columns to master kyc.verifications
-- (Zero existing columns are removed)
-- =========================================================================
alter table kyc.verifications
  add column if not exists cost_inr numeric(10, 2) not null default 0.00,
  add column if not exists rejection_reasons text[] not null default '{}',
  add column if not exists ip_address varchar(45) not null default '0.0.0.0',
  add column if not exists user_agent text null;

-- =========================================================================
-- STEP 2: PILLAR 1 — Vehicle RC Domain
-- =========================================================================

-- 2A. Sub-table: RC Verifications
create table if not exists kyc.rc_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references kyc.verifications(id) on delete cascade,
  actor_id uuid null,
  consent_id uuid not null references kyc.consents(id),

  -- ==================== 1. USER INPUTS & EXACT TIMESTAMP ====================
  input_vehicle_number varchar(20) not null,
  input_engine_number varchar(50) null,
  input_chassis_number varchar(50) null,
  input_vehicle_type varchar(50) null,
  input_submitted_at timestamptz not null default clock_timestamp(), -- Automatic 24-hr timestamp

  -- ==================== 2. COMPLETE VAHAN / SUREPASS OUTPUT FIELDS (35+ FIELDS) ====================
  -- Basic Identification:
  verified_owner_name text null,
  verified_father_name text null,
  verified_present_address text null,
  verified_permanent_address text null,
  verified_mobile_number varchar(20) null,
  registration_date date null,
  registered_at_rto text null,
  rc_status varchar(30) not null default 'ACTIVE',

  -- Vehicle Technical Specifications:
  verified_maker_description text null,       -- e.g. 'TATA MOTORS LTD'
  verified_maker_model text null,             -- e.g. 'TATA HITACHI EXCAVATOR EX200'
  verified_vehicle_class text null,           -- e.g. 'CEV - Construction Equipment Vehicle'
  verified_body_type varchar(50) null,
  verified_fuel_type varchar(30) null,
  verified_color varchar(50) null,
  verified_norms_type varchar(50) null,       -- e.g. 'BHARAT STAGE VI'
  verified_engine_number varchar(50) null,
  verified_chassis_number varchar(50) null,
  cubic_capacity numeric(10, 2) null,         -- Engine CC
  no_cylinders integer null,
  unladen_weight numeric(10, 2) null,         -- Empty vehicle weight (kg)
  vehicle_gross_weight numeric(10, 2) null,   -- Gross loaded weight (kg)
  wheelbase numeric(10, 2) null,
  manufacturing_date date null,
  financer text null,                         -- Bank or finance company if hypothecated

  -- The 4 Pillars of Roadworthiness:
  fitness_status varchar(20) not null default 'UNKNOWN',
  fitness_valid_till date null,
  insurance_status varchar(20) not null default 'UNKNOWN',
  insurance_company text null,
  insurance_policy_number text null,
  insurance_valid_till date null,
  puc_status varchar(20) not null default 'UNKNOWN',
  puc_certificate_number text null,
  puc_valid_till date null,
  permit_status varchar(20) not null default 'UNKNOWN',
  permit_number text null,
  permit_type varchar(50) null,               -- e.g. 'GOODS CARRIER PERMIT'
  permit_valid_till date null,
  national_permit_number text null,
  national_permit_valid_till date null,
  tax_upto date null,                         -- Road tax paid validity date
  is_roadworthy boolean not null default false,

  -- Complete safety net:
  raw_surepass_response jsonb null,           -- 100% full unedited vendor response JSON
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_rc_subtable_vehicle on kyc.rc_verifications(input_vehicle_number);
create index if not exists idx_rc_subtable_actor on kyc.rc_verifications(actor_id);

-- 2B. Dedicated Document Table: RC Photos
create table if not exists kyc.rc_documents (
  id uuid primary key default gen_random_uuid(),
  rc_verification_id uuid null references kyc.rc_verifications(id) on delete cascade,
  actor_id uuid not null,
  document_side varchar(10) not null default 'FRONT' check (document_side in ('FRONT', 'BACK', 'SINGLE')),
  original_filename text not null,
  mime_type varchar(50) not null,
  file_size_bytes integer not null default 0,
  sha256_checksum varchar(64) not null,
  storage_type varchar(20) not null default 'DATABASE_BLOB' check (storage_type in ('DATABASE_BLOB', 'S3_BUCKET', 'LOCAL_DISK')),
  storage_path text null,
  file_data bytea null,
  ocr_extracted_data jsonb null,
  ocr_confidence numeric(5, 2) null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_rc_docs_verification on kyc.rc_documents(rc_verification_id);
create index if not exists idx_rc_docs_sha256 on kyc.rc_documents(sha256_checksum);

-- =========================================================================
-- STEP 3: PILLAR 2 — Driving License Domain
-- =========================================================================

-- 3A. Sub-table: DL Verifications
create table if not exists kyc.dl_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references kyc.verifications(id) on delete cascade,
  actor_id uuid null,
  consent_id uuid not null references kyc.consents(id),

  -- ==================== 1. USER INPUTS & EXACT TIMESTAMP ====================
  input_dl_number varchar(30) not null,
  input_dob date not null,
  input_submitted_at timestamptz not null default clock_timestamp(), -- Automatic 24-hr timestamp

  -- ==================== 2. COMPLETE SARATHI / SUREPASS OUTPUT FIELDS ====================
  -- Driver Identity:
  verified_name text null,
  verified_father_or_husband_name text null,
  verified_gender varchar(10) null,
  verified_blood_group varchar(10) null,
  verified_permanent_address text null,
  verified_temporary_address text null,
  dl_status varchar(30) not null default 'ACTIVE', -- 'ACTIVE', 'EXPIRED', 'SUSPENDED'

  -- Dates & Validity Periods:
  issue_date date null,                       -- Initial date of issue
  valid_from date null,                       -- Non-transport validity start
  valid_till date null,                       -- Non-transport validity expiry
  transport_valid_from date null,             -- Commercial transport start
  transport_valid_till date null,             -- Commercial transport expiry (Vital for heavy machinery!)

  -- RTO & Endorsement Details:
  rto_name text null,                         -- e.g. 'RTO PUNE, MAHARASHTRA'
  rto_code varchar(20) null,                  -- e.g. 'MH-12'
  state varchar(30) null,

  -- Equipment Authorization & Classes:
  vehicle_classes jsonb not null default '[]',-- Array of all COV classes with issue dates
  has_heavy_equipment_endorsement boolean not null default false,
  authorized_equipment_codes text[] not null default '{}', -- e.g. {'TRANS', 'HGMV', 'EXCAVATOR'}
  badge_number varchar(50) null,              -- Commercial driver badge number
  badge_issue_date date null,

  -- ==================== 3. AUDIT & OUTCOME (PASS OR FAIL) ====================
  verification_status varchar(20) not null default 'PENDING' check (verification_status in ('VERIFIED', 'REJECTED', 'FAILED', 'PENDING')),
  is_authentic boolean not null default false,
  is_compliant boolean not null default false,
  rejection_reasons text[] not null default '{}',
  cost_inr numeric(10, 2) not null default 15.00,
  raw_surepass_response jsonb null,           -- 100% full unedited vendor response JSON
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_dl_subtable_dl_num on kyc.dl_verifications(input_dl_number);
create index if not exists idx_dl_subtable_actor on kyc.dl_verifications(actor_id);

-- 3B. Dedicated Document Table: DL Photos
create table if not exists kyc.dl_documents (
  id uuid primary key default gen_random_uuid(),
  dl_verification_id uuid null references kyc.dl_verifications(id) on delete cascade,
  actor_id uuid not null,
  document_side varchar(10) not null default 'FRONT' check (document_side in ('FRONT', 'BACK', 'SINGLE')),
  original_filename text not null,
  mime_type varchar(50) not null,
  file_size_bytes integer not null default 0,
  sha256_checksum varchar(64) not null,
  storage_type varchar(20) not null default 'DATABASE_BLOB' check (storage_type in ('DATABASE_BLOB', 'S3_BUCKET', 'LOCAL_DISK')),
  storage_path text null,
  file_data bytea null,
  ocr_extracted_data jsonb null,
  ocr_confidence numeric(5, 2) null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_dl_docs_verification on kyc.dl_documents(dl_verification_id);
create index if not exists idx_dl_docs_sha256 on kyc.dl_documents(sha256_checksum);

-- =========================================================================
-- STEP 4: PILLAR 3 — E-Challan Domain
-- =========================================================================

-- 4A. Sub-table: Challan Verifications
create table if not exists kyc.challan_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references kyc.verifications(id) on delete cascade,
  actor_id uuid null,
  consent_id uuid not null references kyc.consents(id),

  -- ==================== 1. USER INPUTS & EXACT TIMESTAMP ====================
  input_rc_number varchar(20) not null,
  input_chassis_number varchar(50) null,
  input_engine_number varchar(50) null,
  input_queried_portals text[] not null default '{"DL", "TS", "GJ"}',
  input_submitted_at timestamptz not null default clock_timestamp(), -- Automatic 24-hr timestamp

  -- ==================== 2. COMPLETE TRAFFIC POLICE / SUREPASS OUTPUTS ====================
  vendor_client_id varchar(100) null,
  total_challans integer not null default 0,
  pending_challans_count integer not null default 0,
  disposed_challans_count integer not null default 0,
  total_pending_amount numeric(12, 2) not null default 0.00,
  total_disposed_amount numeric(12, 2) not null default 0.00,
  has_pending_challans boolean not null default false,
  is_traffic_compliant boolean not null default true, -- True ONLY if pending_challans_count = 0
  most_recent_challan_date timestamptz null,
  queried_portals_status jsonb not null default '{}', -- e.g. {"TS": "SUCCESS", "DL": "SUCCESS"}

  -- ==================== 3. AUDIT & OUTCOME (PASS OR FAIL) ====================
  verification_status varchar(20) not null default 'PENDING' check (verification_status in ('VERIFIED', 'REJECTED', 'FAILED', 'PENDING')),
  cost_inr numeric(10, 2) not null default 15.00,
  raw_surepass_response jsonb null,           -- 100% full unedited vendor response JSON
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_challan_subtable_rc on kyc.challan_verifications(input_rc_number);
create index if not exists idx_challan_subtable_actor on kyc.challan_verifications(actor_id);

-- 4B. Dedicated Violation Tickets Table
create table if not exists kyc.challan_tickets (
  id uuid primary key default gen_random_uuid(),
  challan_verification_id uuid not null references kyc.challan_verifications(id) on delete cascade,
  challan_number varchar(50) not null,
  offense_details text not null,
  challan_place text null,
  challan_date timestamptz null,
  state varchar(5) null,
  amount numeric(10, 2) not null default 0.00,
  status varchar(20) not null default 'PENDING',
  payment_date timestamptz null,
  transaction_id text null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_challan_tickets_parent on kyc.challan_tickets(challan_verification_id);
create index if not exists idx_challan_tickets_num on kyc.challan_tickets(challan_number);

-- =========================================================================
-- STEP 5: PILLAR 4 — Aadhaar DigiLocker Domain
-- =========================================================================

-- 5A. Sub-table: Aadhaar Verifications
create table if not exists kyc.aadhaar_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null unique references kyc.verifications(id) on delete cascade,
  actor_id uuid null,
  consent_id uuid not null references kyc.consents(id),

  -- ==================== 1. USER INPUTS & EXACT TIMESTAMP ====================
  input_client_id varchar(100) not null unique, -- DigiLocker transaction session ID
  input_redirect_url text null,
  input_submitted_at timestamptz not null default clock_timestamp(), -- Automatic 24-hr timestamp

  -- ==================== 2. COMPLETE UIDAI / DIGILOCKER OUTPUTS ====================
  -- Identity:
  verified_full_name text null,
  verified_dob date null,
  verified_gender varchar(10) null,
  masked_aadhaar varchar(20) null,            -- e.g. 'XXXX-XXXX-1234' (Zero raw 12-digit storage per UIDAI law)
  care_of text null,                          -- e.g. 'C/O Suresh Sharma'
  mobile_hash text null,                      -- Cryptographic SHA256 of registered mobile
  has_profile_photo boolean not null default false,

  -- Granular Verified Address:
  verified_house text null,
  verified_street text null,
  verified_landmark text null,
  verified_locality text null,
  verified_vtc text null,                     -- Village / Town / City
  verified_subdist text null,                 -- Tehsil / Mandal
  verified_district text null,
  verified_state text null,
  verified_pincode varchar(10) null,
  verified_country text not null default 'India',
  verified_address_json jsonb not null default '{}', -- Complete structured address object

  -- Session & Verification State:
  digilocker_verified boolean not null default false,
  session_status varchar(30) not null default 'INITIATED', -- 'INITIATED', 'COMPLETED', 'FAILED', 'EXPIRED'

  -- ==================== 3. AUDIT & OUTCOME (PASS OR FAIL) ====================
  verification_status varchar(20) not null default 'PENDING' check (verification_status in ('VERIFIED', 'REJECTED', 'FAILED', 'PENDING')),
  cost_inr numeric(10, 2) not null default 15.00,
  raw_surepass_response jsonb null,           -- 100% full unedited vendor response JSON & XML
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_aadhaar_subtable_client on kyc.aadhaar_verifications(input_client_id);
create index if not exists idx_aadhaar_subtable_actor on kyc.aadhaar_verifications(actor_id);

-- 5B. Dedicated Document Table: Aadhaar Signed XML & Profile Photo
create table if not exists kyc.aadhaar_documents (
  id uuid primary key default gen_random_uuid(),
  aadhaar_verification_id uuid not null references kyc.aadhaar_verifications(id) on delete cascade,
  actor_id uuid not null,
  document_type varchar(30) not null default 'AADHAAR_XML' check (document_type in ('AADHAAR_XML', 'PROFILE_PHOTO', 'CONSENT_FORM')),
  mime_type varchar(50) not null,
  sha256_checksum varchar(64) not null,
  storage_type varchar(20) not null default 'DATABASE_BLOB' check (storage_type in ('DATABASE_BLOB', 'S3_BUCKET', 'LOCAL_DISK')),
  storage_path text null,
  file_data bytea null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_aadhaar_docs_parent on kyc.aadhaar_documents(aadhaar_verification_id);

-- =========================================================================
-- STEP 6: Permissions & Grants for runtime roles
-- =========================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on all tables in schema kyc to service_role;
    grant all on all sequences in schema kyc to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'equiprent_api') then
    grant all on all tables in schema kyc to equiprent_api;
    grant all on all sequences in schema kyc to equiprent_api;
  end if;
end $$;

commit;

