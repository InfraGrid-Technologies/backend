-- Migration: Add RC Vehicle Categories & COV Codes
begin;

-- 1. Create table kyc.rc_vehicle_categories
create table if not exists kyc.rc_vehicle_categories (
  id text primary key,
  name text not null,
  cov_code text not null,
  cov_description text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);

-- 2. Seed the 13 verified heavy equipment fleet types
insert into kyc.rc_vehicle_categories (id, name, cov_code, cov_description, display_order)
values
  ('mini-excavator', 'Mini Excavator', 'CEV', 'Construction Equipment Vehicle', 1),
  ('small-excavator', 'Small Excavator', 'CEV', 'Construction Equipment Vehicle', 2),
  ('medium-excavator', 'Medium Excavator', 'CEV', 'Construction Equipment Vehicle', 3),
  ('backhoe', 'Backhoe (JCB 3DX)', 'CEV', 'Construction Equipment Vehicle', 4),
  ('wheel-loader', 'Wheel Loader', 'CEV', 'Construction Equipment Vehicle', 5),
  ('hydra-crane', 'Hydra Crane', 'CEV', 'Construction Equipment Vehicle / Mobile Crane', 6),
  ('self-loading-mixer', 'Self-Loading Mixer', 'CEV', 'Construction Equipment Vehicle', 7),
  ('concrete-pump', 'Concrete Pump', 'CEV', 'Construction Equipment Vehicle', 8),
  ('soil-compactor', 'Soil Compactor', 'CEV', 'Construction Equipment Vehicle / Road Roller', 9),
  ('tandem-roller', 'Tandem Roller', 'CEV', 'Construction Equipment Vehicle / Road Roller', 10),
  ('pneumatic-roller', 'Pneumatic Roller', 'CEV', 'Construction Equipment Vehicle / Road Roller', 11),
  ('tipper', 'Tipper Dump Truck', 'HGV / HGMV', 'Heavy Goods Commercial Vehicle (HGV/HGMV)', 12),
  ('transit-mixer', 'Transit Mixer', 'HGV / CEV', 'Heavy Commercial Goods Vehicle (HGV/CEV)', 13)
on conflict (id) do update set
  name = excluded.name,
  cov_code = excluded.cov_code,
  cov_description = excluded.cov_description,
  display_order = excluded.display_order;

-- 3. Grant table permissions
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on table kyc.rc_vehicle_categories to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'equiprent_api') then
    grant all on table kyc.rc_vehicle_categories to equiprent_api;
  end if;
end $$;

commit;
