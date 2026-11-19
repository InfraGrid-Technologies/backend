-- Migration: Add authenticity columns and COV categories
begin;

-- 1. Add is_authentic and is_compliant to kyc.verifications
alter table kyc.verifications 
  add column if not exists is_authentic boolean not null default false,
  add column if not exists is_compliant boolean not null default false;

-- 2. Create kyc.cov_categories table
create table if not exists kyc.cov_categories (
  code text primary key,
  description text,
  is_heavy_equipment boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);

-- 3. Seed standard Parivahan COV codes
insert into kyc.cov_categories (code, description, is_heavy_equipment)
values
  ('TRANS', 'Transport Commercial Vehicle', true),
  ('TRANS-HV', 'Transport Heavy Vehicle', true),
  ('HGMV', 'Heavy Goods Motor Vehicle (Tippers, Dumpers)', true),
  ('HMV', 'Heavy Motor Vehicle', true),
  ('HTV', 'Heavy Transport Vehicle', true),
  ('HPMV', 'Heavy Passenger Motor Vehicle', true),
  ('MGV', 'Medium Goods Vehicle', true),
  ('MMV', 'Medium Motor Vehicle', true),
  ('CHGVA', 'Commercial Heavy Goods Vehicle', true),
  ('CRANE', 'Mobile / Tower Cranes', true),
  ('EXCAVATOR', 'Excavators / Earthmovers / Backhoe Loaders', true),
  ('LOADER', 'Heavy Loaders', true),
  ('FORKLIFT', 'Industrial Forklifts', true),
  ('ROAD_ROLLER', 'Road Rollers / Compactors', true),
  ('CONSTRUCTION_EQUIPMENT', 'Construction Equipment Vehicles (CEV)', true),
  ('CONSTRN', 'Construction Equipment abbreviation', true),
  ('CEV', 'Construction Equipment Vehicle code', true),
  ('TRACTOR', 'Commercial Tractors / Haulers', true),
  ('LMV', 'Light Motor Vehicle (Cars, Jeeps)', false),
  ('MCWG', 'Motor Cycle With Gear', false)
on conflict (code) do nothing;

-- 4. Permissions for application roles
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table kyc.cov_categories to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'equiprent_api') then
    grant all on table kyc.cov_categories to equiprent_api;
  end if;
end $$;

commit;

