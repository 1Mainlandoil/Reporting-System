-- =============================================================================
-- MAINLAND REPORT SYSTEM — FULL SUPABASE SCHEMA (run this file only)
-- =============================================================================
-- WHERE:  Supabase Dashboard → SQL Editor → New query
-- HOW:    Paste this entire file → click Run
-- SAFE:   Re-run anytime; uses IF NOT EXISTS / idempotent alters throughout.
--
-- Includes:
--   • All tables, columns, indexes
--   • Chat seen/delivered status (status + seen_at)
--   • Drops stock/cash non-negative report enforcement (no blocking on save)
--   • Terminal Operator role for product request final approval
--   • Row-level security policies
--   • Realtime publication for chat, reports, users
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.stations (
  id text primary key,
  name text not null,
  location text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id text primary key,
  name text not null,
  role text not null check (role in ('staff', 'supervisor', 'admin', 'terminal_operator', 'inspector')),
  station_id text references public.stations(id) on delete set null,
  phone_number text,
  email text,
  manager_username text,
  manager_password_hash text,
  approval_status text not null default 'approved' check (approval_status in ('pending', 'approved', 'rejected', 'correction_requested')),
  approval_reviewed_by text,
  approval_reviewed_at timestamptz,
  approval_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.product_requests (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  manager_id text not null references public.users(id) on delete cascade,
  manager_name text not null,
  requested_product_type text not null check (requested_product_type in ('PMS', 'AGO')),
  requested_liters numeric not null default 0,
  manager_remark text not null default '',
  status text not null default 'submitted',
  manager_status_label text not null default 'Requested',
  supervisor_decision text,
  supervisor_remark text not null default '',
  supervisor_name text not null default '',
  supervisor_reviewed_at timestamptz,
  admin_decision text,
  admin_remark text not null default '',
  admin_name text not null default '',
  admin_reviewed_at timestamptz,
  approved_product_type text,
  approved_liters numeric,
  cost_price_per_liter numeric not null default 0,
  transport_cost_per_liter numeric not null default 0,
  landing_cost_per_liter numeric not null default 0,
  total_product_cost numeric not null default 0,
  total_transport_cost numeric not null default 0,
  total_landing_cost numeric not null default 0,
  dispatch_note text not null default '',
  dispatch_status text not null default 'requested',
  received_tank_dip numeric,
  received_at timestamptz,
  received_by text not null default '',
  received_remark text not null default '',
  received_report_id text not null default '',
  received_report_date date,
  issue_reported_at timestamptz,
  issue_reported_by text not null default '',
  issue_remark text not null default '',
  called_back_at timestamptz,
  called_back_by text not null default '',
  callback_reason text not null default '',
  terminal_decision text,
  terminal_remark text not null default '',
  terminal_name text not null default '',
  terminal_reviewed_at timestamptz,
  truck_number text not null default '',
  truck_driver text not null default '',
  low_stock_photo_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_finalizations (
  date date primary key,
  general_remark text not null default '',
  station_reviews jsonb not null default '[]'::jsonb,
  finalized_by text not null default 'Supervisor',
  finalized_by_user_id text,
  finalized_at timestamptz not null default now(),
  status text not null default 'finalized',
  admin_acknowledged_by text,
  admin_acknowledged_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.interventions (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  station_name text not null,
  status text not null,
  stage text not null,
  message text not null,
  created_by text not null default 'Supervisor',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_reports (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  date date not null,
  opening_stock_pms numeric not null default 0,
  opening_stock_ago numeric not null default 0,
  pms_price numeric not null default 0,
  ago_price numeric not null default 0,
  multi_pricing boolean not null default false,
  price_bands_pms jsonb not null default '[]'::jsonb,
  price_bands_ago jsonb not null default '[]'::jsonb,
  sales_amount_pms numeric not null default 0,
  sales_amount_ago numeric not null default 0,
  total_sales_amount numeric not null default 0,
  received_product boolean not null default false,
  received_product_type text check (received_product_type in ('PMS', 'AGO')),
  quantity_received numeric not null default 0,
  received_pms numeric not null default 0,
  received_ago numeric not null default 0,
  product_dispatch_receipts jsonb not null default '[]'::jsonb,
  no_sales_day boolean not null default false,
  no_sales_reason text not null default '',
  no_sales_note text not null default '',
  total_sales_liters_pms numeric not null default 0,
  total_sales_liters_ago numeric not null default 0,
  rtt_pms numeric not null default 0,
  rtt_ago numeric not null default 0,
  remark text not null default '',
  expense_amount numeric not null default 0,
  expense_description text not null default '',
  expense_items jsonb not null default '[]'::jsonb,
  supervisor_review_status text,
  supervisor_review_remark text,
  supervisor_reviewed_by text,
  supervisor_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id text primary key,
  from_user_id text not null references public.users(id) on delete cascade,
  to_user_id text not null references public.users(id) on delete cascade,
  text text not null,
  status text not null default 'delivered',
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- Chat delivery/read tracking (persist seen state across refresh and devices)
alter table public.chat_messages
  add column if not exists status text not null default 'delivered',
  add column if not exists seen_at timestamptz;

update public.chat_messages
set status = 'delivered'
where status is null;

create table if not exists public.admin_daily_reviews (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  supervisor_finalized_by text not null default '',
  general_remark text not null default '',
  station_reviews jsonb not null default '[]'::jsonb,
  saved_by text not null default 'Admin',
  saved_by_user_id text references public.users(id) on delete set null,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_replenishment_workflows (
  station_id text primary key references public.stations(id) on delete cascade,
  manager_name text not null default 'Unassigned',
  urgency text not null default 'warning',
  stock_remaining numeric not null default 0,
  suggested_quantity numeric not null default 0,
  approved_quantity numeric not null default 0,
  status text not null default 'Pending Approval',
  note text not null default '',
  updated_by text not null default 'Admin',
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_report_resolutions (
  report_id text primary key references public.daily_reports(id) on delete cascade,
  station_id text not null references public.stations(id) on delete cascade,
  station_name text not null,
  report_date date not null,
  supervisor_name text not null default 'Supervisor',
  review_status text not null default 'Reviewed',
  supervisor_remark text not null default '',
  resolution text not null default '',
  note text not null default '',
  updated_by text not null default 'Admin',
  updated_at timestamptz not null default now()
);

create table if not exists public.month_end_finalizations (
  month_key text primary key,
  month_label text not null default '',
  station_summaries jsonb not null default '[]'::jsonb,
  finalized_by text not null default 'Supervisor',
  finalized_by_user_id text,
  finalized_at timestamptz not null default now(),
  status text not null default 'finalized',
  admin_acknowledged_by text,
  admin_acknowledged_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.daily_reports
  add column if not exists received_product_type text check (received_product_type in ('PMS', 'AGO'));

alter table public.daily_reports
  add column if not exists closing_stock_pms numeric,
  add column if not exists closing_stock_ago numeric;

alter table public.daily_reports
  add column if not exists payment_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists total_payment_deposits numeric not null default 0,
  add column if not exists pump_readings jsonb not null default '[]'::jsonb,
  add column if not exists multi_pricing boolean not null default false,
  add column if not exists price_bands_pms jsonb not null default '[]'::jsonb,
  add column if not exists price_bands_ago jsonb not null default '[]'::jsonb,
  add column if not exists sales_amount_pms numeric not null default 0,
  add column if not exists sales_amount_ago numeric not null default 0,
  add column if not exists total_sales_amount numeric not null default 0,
  add column if not exists received_pms numeric not null default 0,
  add column if not exists received_ago numeric not null default 0,
  add column if not exists product_dispatch_receipts jsonb not null default '[]'::jsonb,
  add column if not exists no_sales_day boolean not null default false,
  add column if not exists no_sales_reason text not null default '',
  add column if not exists no_sales_note text not null default '',
  add column if not exists cash_bf numeric not null default 0,
  add column if not exists cash_sales numeric not null default 0,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists closing_balance numeric not null default 0;

alter table public.daily_reports
  add column if not exists quantity_remaining_pms numeric,
  add column if not exists quantity_remaining_ago numeric;

alter table public.daily_reports
  add column if not exists calculated_sales_liters_pms numeric,
  add column if not exists calculated_sales_liters_ago numeric;

alter table public.daily_reports
  add column if not exists manager_entered_sales_liters_pms numeric,
  add column if not exists manager_entered_sales_liters_ago numeric;

alter table public.daily_reports
  add column if not exists supervisor_correction_history jsonb not null default '[]'::jsonb,
  add column if not exists report_finalization_status text not null default '',
  add column if not exists report_finalized_by text not null default '',
  add column if not exists report_finalized_by_user_id text,
  add column if not exists report_finalized_at timestamptz,
  add column if not exists report_finalization_remark text not null default '';

alter table public.daily_reports
  add column if not exists report_type text not null default 'fuel',
  add column if not exists lpg_report jsonb;

alter table public.daily_reports
  add column if not exists eod_attachments jsonb not null default '[]'::jsonb,
  add column if not exists has_discrepancy boolean not null default false,
  add column if not exists discrepancies jsonb not null default '[]'::jsonb;

alter table public.daily_reports
  add column if not exists correction_request jsonb;

create table if not exists public.inspector_visits (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  inspector_id text not null references public.users(id) on delete cascade,
  inspector_name text not null default '',
  visit_date date not null,
  arrival_time text not null default '',
  departure_time text not null default '',
  manager_in_charge text not null default '',
  cash_bf numeric not null default 0,
  cash numeric not null default 0,
  pos_bf numeric not null default 0,
  pos numeric not null default 0,
  tank_readings jsonb not null default '[]'::jsonb,
  pump_readings jsonb not null default '[]'::jsonb,
  photo_evidence jsonb not null default '[]'::jsonb,
  remark text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inspector_visits_visit_date on public.inspector_visits(visit_date desc);
create index if not exists idx_inspector_visits_station_date on public.inspector_visits(station_id, visit_date desc);

alter table public.inspector_visits
  add column if not exists photo_evidence jsonb not null default '[]'::jsonb;

-- Manual costing: backfills COGS for litres already sold with no matching
-- dispatch batch (FIFO in batchCosting.js had nothing to draw from). This is
-- a standalone correction ledger, not a new batch — it never feeds the FIFO
-- dispatch pool, so it can't be consumed by future sales, only applied
-- against litres already recorded as uncosted at entry time.
create table if not exists public.manual_cost_entries (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  product_type text not null check (product_type in ('PMS', 'AGO')),
  quantity numeric not null check (quantity > 0),
  cost_price_per_liter numeric not null default 0,
  transport_cost_per_liter numeric not null default 0,
  landing_cost_per_liter numeric not null default 0,
  remark text not null default '',
  entered_by text not null default 'Admin',
  entered_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_manual_cost_entries_station_product on public.manual_cost_entries(station_id, product_type, created_at asc);

-- POS terminal catalog: replaces the static posTerminals.generated.json file
-- that required a code deploy to add/swap/remove a station's POS terminal.
-- Soft-delete only (is_active) - a terminal removed from a station's active
-- list stays in the table so old reports that already recorded amounts
-- against it aren't orphaned; managers just stop seeing it as an option.
create table if not exists public.pos_terminals (
  id text primary key,
  station_id text not null references public.stations(id) on delete cascade,
  tid text not null,
  bank text not null,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_pos_terminals_station_tid on public.pos_terminals(station_id, tid);
create index if not exists idx_pos_terminals_station_active on public.pos_terminals(station_id, is_active);

alter table public.users
  add column if not exists manager_username text,
  add column if not exists manager_password_hash text;

alter table public.product_requests
  add column if not exists terminal_decision text,
  add column if not exists terminal_remark text not null default '',
  add column if not exists terminal_name text not null default '',
  add column if not exists terminal_reviewed_at timestamptz,
  add column if not exists truck_number text not null default '',
  add column if not exists truck_driver text not null default '',
  add column if not exists cost_price_per_liter numeric not null default 0,
  add column if not exists transport_cost_per_liter numeric not null default 0,
  add column if not exists landing_cost_per_liter numeric not null default 0,
  add column if not exists total_product_cost numeric not null default 0,
  add column if not exists total_transport_cost numeric not null default 0,
  add column if not exists total_landing_cost numeric not null default 0,
  add column if not exists dispatch_status text not null default 'requested',
  add column if not exists received_tank_dip numeric,
  add column if not exists received_at timestamptz,
  add column if not exists received_by text not null default '',
  add column if not exists received_remark text not null default '',
  add column if not exists received_report_id text not null default '',
  add column if not exists received_report_date date,
  add column if not exists issue_reported_at timestamptz,
  add column if not exists issue_reported_by text not null default '',
  add column if not exists issue_remark text not null default '',
  add column if not exists called_back_at timestamptz,
  add column if not exists called_back_by text not null default '',
  add column if not exists callback_reason text not null default '',
  add column if not exists low_stock_photo_urls jsonb not null default '[]'::jsonb;

-- Report evidence photos (EOD bank/POS proofs, low-stock tank dip images)
insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read report evidence" on storage.objects;
create policy "Public read report evidence"
  on storage.objects for select
  using (bucket_id = 'report-evidence');

drop policy if exists "Upload report evidence" on storage.objects;
create policy "Upload report evidence"
  on storage.objects for insert
  with check (bucket_id = 'report-evidence');

alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('staff', 'supervisor', 'admin', 'terminal_operator', 'inspector'));

insert into public.users (id, name, role, email, approval_status)
values ('insp-demo-1', 'Demo Inspector', 'inspector', 'inspector@mainlandoil.com', 'approved')
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    email = excluded.email,
    approval_status = excluded.approval_status;

create index if not exists idx_daily_reports_station_date on public.daily_reports(station_id, date desc);
drop index if exists ux_daily_reports_station_date;
create unique index if not exists ux_daily_reports_station_date_type on public.daily_reports(station_id, date, report_type);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_user_id, to_user_id, created_at desc);
create index if not exists idx_admin_daily_reviews_date on public.admin_daily_reviews(date desc);
create index if not exists idx_product_requests_station_created on public.product_requests(station_id, created_at desc);
create index if not exists idx_daily_finalizations_date on public.daily_finalizations(date desc);
create index if not exists idx_interventions_station_updated on public.interventions(station_id, updated_at desc);
create index if not exists idx_admin_replenishment_status on public.admin_replenishment_workflows(status, updated_at desc);
create index if not exists idx_admin_report_resolutions_updated on public.admin_report_resolutions(updated_at desc);

-- Stock/cash non-negative enforcement removed — reports save as entered.
drop trigger if exists trg_daily_reports_non_negative on public.daily_reports;
drop function if exists public.enforce_daily_reports_non_negative();

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_non_negative'
  ) then
    alter table public.daily_reports drop constraint chk_daily_reports_non_negative;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_no_sales_reason'
  ) then
    alter table public.daily_reports
      add constraint chk_daily_reports_no_sales_reason
      check (
        (no_sales_day = false) or
        (length(trim(no_sales_reason)) > 0)
      ) not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_received_consistency'
  ) then
    alter table public.daily_reports drop constraint chk_daily_reports_received_consistency;
  end if;
end $$;

create index if not exists idx_month_end_finalizations_month on public.month_end_finalizations(month_key desc);

alter table public.stations enable row level security;
alter table public.users enable row level security;
alter table public.daily_reports enable row level security;
alter table public.chat_messages enable row level security;
alter table public.admin_daily_reviews enable row level security;
alter table public.product_requests enable row level security;
alter table public.daily_finalizations enable row level security;
alter table public.interventions enable row level security;
alter table public.admin_replenishment_workflows enable row level security;
alter table public.admin_report_resolutions enable row level security;
alter table public.month_end_finalizations enable row level security;
alter table public.inspector_visits enable row level security;
alter table public.manual_cost_entries enable row level security;
alter table public.pos_terminals enable row level security;

drop policy if exists "allow all stations" on public.stations;
drop policy if exists "allow all users" on public.users;
drop policy if exists "allow all reports" on public.daily_reports;
drop policy if exists "allow all chat messages" on public.chat_messages;
drop policy if exists "allow all admin daily reviews" on public.admin_daily_reviews;
drop policy if exists "allow all product requests" on public.product_requests;
drop policy if exists "allow all daily finalizations" on public.daily_finalizations;
drop policy if exists "allow all interventions" on public.interventions;
drop policy if exists "allow all admin replenishment workflows" on public.admin_replenishment_workflows;
drop policy if exists "allow all admin report resolutions" on public.admin_report_resolutions;
drop policy if exists "allow all month end finalizations" on public.month_end_finalizations;
drop policy if exists "allow all inspector visits" on public.inspector_visits;
drop policy if exists "allow all manual cost entries" on public.manual_cost_entries;
drop policy if exists "allow all pos terminals" on public.pos_terminals;

create policy "allow all stations" on public.stations for all using (true) with check (true);
create policy "allow all users" on public.users for all using (true) with check (true);
create policy "allow all reports" on public.daily_reports for all using (true) with check (true);
create policy "allow all chat messages" on public.chat_messages for all using (true) with check (true);
create policy "allow all admin daily reviews" on public.admin_daily_reviews for all using (true) with check (true);
create policy "allow all product requests" on public.product_requests for all using (true) with check (true);
create policy "allow all daily finalizations" on public.daily_finalizations for all using (true) with check (true);
create policy "allow all interventions" on public.interventions for all using (true) with check (true);
create policy "allow all admin replenishment workflows" on public.admin_replenishment_workflows for all using (true) with check (true);
create policy "allow all admin report resolutions" on public.admin_report_resolutions for all using (true) with check (true);
create policy "allow all month end finalizations" on public.month_end_finalizations for all using (true) with check (true);
create policy "allow all inspector visits" on public.inspector_visits for all using (true) with check (true);
create policy "allow all manual cost entries" on public.manual_cost_entries for all using (true) with check (true);
create policy "allow all pos terminals" on public.pos_terminals for all using (true) with check (true);

-- Realtime: push chat + report (+ user contact) changes to connected clients
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'daily_reports'
  ) then
    alter publication supabase_realtime add table public.daily_reports;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'users'
  ) then
    alter publication supabase_realtime add table public.users;
  end if;
end $$;

-- One-time seed: migrates the 224 existing POS terminal assignments from
-- src/data/posTerminals.generated.json into the new table above. Safe to
-- re-run - "on conflict do nothing" means it never duplicates or overwrites
-- anything already in the table (including edits made later via IT admin).
insert into public.pos_terminals (id, station_id, tid, bank, label, is_active) values
  ('pos-stn-1-2LUX03EB', 'stn-1', '2LUX03EB', 'FCMB', 'FCMB - 2LUX03EB', true),
  ('pos-stn-1-2082FO96', 'stn-1', '2082FO96', 'KEYSTONE', 'KEYSTONE - 2082FO96', true),
  ('pos-stn-1-2TPTG8PA', 'stn-1', '2TPTG8PA', 'MONIEPOINT', 'MONIEPOINT - 2TPTG8PA', true),
  ('pos-stn-2-2214CG6K', 'stn-2', '2214CG6K', 'FCMB', 'FCMB - 2214CG6K', true),
  ('pos-stn-2-2TPTG4PI', 'stn-2', '2TPTG4PI', 'MONIEPOINT', 'MONIEPOINT - 2TPTG4PI', true),
  ('pos-stn-2-2TPTI5HC', 'stn-2', '2TPTI5HC', 'MONIEPOINT', 'MONIEPOINT - 2TPTI5HC', true),
  ('pos-stn-2-2TPTKIJG', 'stn-2', '2TPTKIJG', 'MONIEPOINT', 'MONIEPOINT - 2TPTKIJG', true),
  ('pos-stn-2-21060582', 'stn-2', '21060582', 'SIGNATURE', 'SIGNATURE - 21060582', true),
  ('pos-stn-2-2033Z3M4', 'stn-2', '2033Z3M4', 'UBA', 'UBA - 2033Z3M4', true),
  ('pos-stn-3-2MP1S11N', 'stn-3', '2MP1S11N', 'MONIEPOINT', 'MONIEPOINT - 2MP1S11N', true),
  ('pos-stn-3-2TPTC2KZ', 'stn-3', '2TPTC2KZ', 'MONIEPOINT', 'MONIEPOINT - 2TPTC2KZ', true),
  ('pos-stn-4-2LUX01P6', 'stn-4', '2LUX01P6', 'FCMB', 'FCMB - 2LUX01P6', true),
  ('pos-stn-4-2LUX04U0', 'stn-4', '2LUX04U0', 'FCMB', 'FCMB - 2LUX04U0', true),
  ('pos-stn-4-2082FH57', 'stn-4', '2082FH57', 'KEYSTONE', 'KEYSTONE - 2082FH57', true),
  ('pos-stn-4-2MP1T4J6', 'stn-4', '2MP1T4J6', 'MONIEPOINT', 'MONIEPOINT - 2MP1T4J6', true),
  ('pos-stn-4-2TPT9T7X', 'stn-4', '2TPT9T7X', 'MONIEPOINT', 'MONIEPOINT - 2TPT9T7X', true),
  ('pos-stn-4-21060563', 'stn-4', '21060563', 'SIGNATURE', 'SIGNATURE - 21060563', true),
  ('pos-stn-4-2PQ35157', 'stn-4', '2PQ35157', 'WEMA', 'WEMA - 2PQ35157', true),
  ('pos-stn-6-221438UM', 'stn-6', '221438UM', 'FCMB', 'FCMB - 221438UM', true),
  ('pos-stn-6-2LUX03EA', 'stn-6', '2LUX03EA', 'FCMB', 'FCMB - 2LUX03EA', true),
  ('pos-stn-6-2082IE85', 'stn-6', '2082IE85', 'KEYSTONE', 'KEYSTONE - 2082IE85', true),
  ('pos-stn-6-2MP1PO1G', 'stn-6', '2MP1PO1G', 'MONIEPOINT', 'MONIEPOINT - 2MP1PO1G', true),
  ('pos-stn-6-2TPT2L34', 'stn-6', '2TPT2L34', 'MONIEPOINT', 'MONIEPOINT - 2TPT2L34', true),
  ('pos-stn-6-2TPTK5IE', 'stn-6', '2TPTK5IE', 'MONIEPOINT', 'MONIEPOINT - 2TPTK5IE', true),
  ('pos-stn-6-21060271', 'stn-6', '21060271', 'SIGNATURE', 'SIGNATURE - 21060271', true),
  ('pos-stn-6-21060573', 'stn-6', '21060573', 'SIGNATURE', 'SIGNATURE - 21060573', true),
  ('pos-stn-6-2PQ35162', 'stn-6', '2PQ35162', 'WEMA', 'WEMA - 2PQ35162', true),
  ('pos-stn-7-2LUX03ED', 'stn-7', '2LUX03ED', 'FCMB', 'FCMB - 2LUX03ED', true),
  ('pos-stn-7-2MP14L9S', 'stn-7', '2MP14L9S', 'MONIEPOINT', 'MONIEPOINT - 2MP14L9S', true),
  ('pos-stn-7-2MP1QUCE', 'stn-7', '2MP1QUCE', 'MONIEPOINT', 'MONIEPOINT - 2MP1QUCE', true),
  ('pos-stn-7-2TPT2N71', 'stn-7', '2TPT2N71', 'MONIEPOINT', 'MONIEPOINT - 2TPT2N71', true),
  ('pos-stn-7-2TPT2NR1', 'stn-7', '2TPT2NR1', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NR1', true),
  ('pos-stn-7-2TPT6ACR', 'stn-7', '2TPT6ACR', 'MONIEPOINT', 'MONIEPOINT - 2TPT6ACR', true),
  ('pos-stn-7-21060272', 'stn-7', '21060272', 'SIGNATURE', 'SIGNATURE - 21060272', true),
  ('pos-stn-7-21060589', 'stn-7', '21060589', 'SIGNATURE', 'SIGNATURE - 21060589', true),
  ('pos-stn-7-2PQ35181', 'stn-7', '2PQ35181', 'WEMA', 'WEMA - 2PQ35181', true),
  ('pos-stn-8-2214KDA8', 'stn-8', '2214KDA8', 'FCMB', 'FCMB - 2214KDA8', true),
  ('pos-stn-8-20826952', 'stn-8', '20826952', 'KEYSTONE', 'KEYSTONE - 20826952', true),
  ('pos-stn-8-2MP19GTR', 'stn-8', '2MP19GTR', 'MONIEPOINT', 'MONIEPOINT - 2MP19GTR', true),
  ('pos-stn-8-2TPT2B90', 'stn-8', '2TPT2B90', 'MONIEPOINT', 'MONIEPOINT - 2TPT2B90', true),
  ('pos-stn-8-21060575', 'stn-8', '21060575', 'SIGNATURE', 'SIGNATURE - 21060575', true),
  ('pos-stn-9-2214A6QG', 'stn-9', '2214A6QG', 'FCMB', 'FCMB - 2214A6QG', true),
  ('pos-stn-9-2214NIIY', 'stn-9', '2214NIIY', 'FCMB', 'FCMB - 2214NIIY', true),
  ('pos-stn-9-2082YC47', 'stn-9', '2082YC47', 'KEYSTONE', 'KEYSTONE - 2082YC47', true),
  ('pos-stn-9-2MP1EUY4', 'stn-9', '2MP1EUY4', 'MONIEPOINT', 'MONIEPOINT - 2MP1EUY4', true),
  ('pos-stn-9-2TPT2NLE', 'stn-9', '2TPT2NLE', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NLE', true),
  ('pos-stn-10-2214WTJW', 'stn-10', '2214WTJW', 'FCMB', 'FCMB - 2214WTJW', true),
  ('pos-stn-10-2MP18ALK', 'stn-10', '2MP18ALK', 'MONIEPOINT', 'MONIEPOINT - 2MP18ALK', true),
  ('pos-stn-10-2MP1INBY', 'stn-10', '2MP1INBY', 'MONIEPOINT', 'MONIEPOINT - 2MP1INBY', true),
  ('pos-stn-10-2TPT2KGD', 'stn-10', '2TPT2KGD', 'MONIEPOINT', 'MONIEPOINT - 2TPT2KGD', true),
  ('pos-stn-10-21060585', 'stn-10', '21060585', 'SIGNATURE', 'SIGNATURE - 21060585', true),
  ('pos-stn-10-2033V3KO', 'stn-10', '2033V3KO', 'UBA', 'UBA - 2033V3KO', true),
  ('pos-stn-10-2033Z3M3', 'stn-10', '2033Z3M3', 'UBA', 'UBA - 2033Z3M3', true),
  ('pos-stn-11-2LUX03EE', 'stn-11', '2LUX03EE', 'FCMB', 'FCMB - 2LUX03EE', true),
  ('pos-stn-11-2082FJ17', 'stn-11', '2082FJ17', 'KEYSTONE', 'KEYSTONE - 2082FJ17', true),
  ('pos-stn-11-2082YB5B', 'stn-11', '2082YB5B', 'KEYSTONE', 'KEYSTONE - 2082YB5B', true),
  ('pos-stn-11-2MP16CYY', 'stn-11', '2MP16CYY', 'MONIEPOINT', 'MONIEPOINT - 2MP16CYY', true),
  ('pos-stn-11-2TPT2NYB', 'stn-11', '2TPT2NYB', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NYB', true),
  ('pos-stn-11-2TPTJUWL', 'stn-11', '2TPTJUWL', 'MONIEPOINT', 'MONIEPOINT - 2TPTJUWL', true),
  ('pos-stn-11-21060268', 'stn-11', '21060268', 'SIGNATURE', 'SIGNATURE - 21060268', true),
  ('pos-stn-11-21060562', 'stn-11', '21060562', 'SIGNATURE', 'SIGNATURE - 21060562', true),
  ('pos-stn-11-2PQ35158', 'stn-11', '2PQ35158', 'WEMA', 'WEMA - 2PQ35158', true),
  ('pos-stn-12-2044ZSNR', 'stn-12', '2044ZSNR', 'ACCESS', 'ACCESS - 2044ZSNR', true),
  ('pos-stn-12-2LUX03EC', 'stn-12', '2LUX03EC', 'FCMB', 'FCMB - 2LUX03EC', true),
  ('pos-stn-12-2082HZ44', 'stn-12', '2082HZ44', 'KEYSTONE', 'KEYSTONE - 2082HZ44', true),
  ('pos-stn-12-2082VP63', 'stn-12', '2082VP63', 'KEYSTONE', 'KEYSTONE - 2082VP63', true),
  ('pos-stn-12-2MP1G7ES', 'stn-12', '2MP1G7ES', 'MONIEPOINT', 'MONIEPOINT - 2MP1G7ES', true),
  ('pos-stn-12-2TPT1ZWL', 'stn-12', '2TPT1ZWL', 'MONIEPOINT', 'MONIEPOINT - 2TPT1ZWL', true),
  ('pos-stn-12-2TPTDLK0', 'stn-12', '2TPTDLK0', 'MONIEPOINT', 'MONIEPOINT - 2TPTDLK0', true),
  ('pos-stn-12-21060576', 'stn-12', '21060576', 'SIGNATURE', 'SIGNATURE - 21060576', true),
  ('pos-stn-12-2PQ35159', 'stn-12', '2PQ35159', 'WEMA', 'WEMA - 2PQ35159', true),
  ('pos-stn-13-2MP1K3I0', 'stn-13', '2MP1K3I0', 'MONIEPOINT', 'MONIEPOINT - 2MP1K3I0', true),
  ('pos-stn-13-2TPT2KCK', 'stn-13', '2TPT2KCK', 'MONIEPOINT', 'MONIEPOINT - 2TPT2KCK', true),
  ('pos-stn-13-21060569', 'stn-13', '21060569', 'SIGNATURE', 'SIGNATURE - 21060569', true),
  ('pos-stn-14-2MP1E8RO', 'stn-14', '2MP1E8RO', 'MONIEPOINT', 'MONIEPOINT - 2MP1E8RO', true),
  ('pos-stn-14-2MP1HRED', 'stn-14', '2MP1HRED', 'MONIEPOINT', 'MONIEPOINT - 2MP1HRED', true),
  ('pos-stn-14-2TPT2BRU', 'stn-14', '2TPT2BRU', 'MONIEPOINT', 'MONIEPOINT - 2TPT2BRU', true),
  ('pos-stn-14-2TPT2DPA', 'stn-14', '2TPT2DPA', 'MONIEPOINT', 'MONIEPOINT - 2TPT2DPA', true),
  ('pos-stn-14-2TPTI355', 'stn-14', '2TPTI355', 'MONIEPOINT', 'MONIEPOINT - 2TPTI355', true),
  ('pos-stn-15-2TPTIJ6Q', 'stn-15', '2TPTIJ6Q', 'MONIEPOINT', 'MONIEPOINT - 2TPTIJ6Q', true),
  ('pos-stn-15-21060257', 'stn-15', '21060257', 'SIGNATURE', 'SIGNATURE - 21060257', true),
  ('pos-stn-15-21060570', 'stn-15', '21060570', 'SIGNATURE', 'SIGNATURE - 21060570', true),
  ('pos-stn-16-2LUX03EF', 'stn-16', '2LUX03EF', 'FCMB', 'FCMB - 2LUX03EF', true),
  ('pos-stn-16-2MP1RI88', 'stn-16', '2MP1RI88', 'MONIEPOINT', 'MONIEPOINT - 2MP1RI88', true),
  ('pos-stn-16-2TPT2NUD', 'stn-16', '2TPT2NUD', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NUD', true),
  ('pos-stn-16-2TPT6T8Y', 'stn-16', '2TPT6T8Y', 'MONIEPOINT', 'MONIEPOINT - 2TPT6T8Y', true),
  ('pos-stn-16-21060267', 'stn-16', '21060267', 'SIGNATURE', 'SIGNATURE - 21060267', true),
  ('pos-stn-16-21060572', 'stn-16', '21060572', 'SIGNATURE', 'SIGNATURE - 21060572', true),
  ('pos-stn-16-2PQ35161', 'stn-16', '2PQ35161', 'WEMA', 'WEMA - 2PQ35161', true),
  ('pos-stn-16-2PQ35164', 'stn-16', '2PQ35164', 'WEMA', 'WEMA - 2PQ35164', true),
  ('pos-stn-17-20826951', 'stn-17', '20826951', 'KEYSTONE', 'KEYSTONE - 20826951', true),
  ('pos-stn-17-20826956', 'stn-17', '20826956', 'KEYSTONE', 'KEYSTONE - 20826956', true),
  ('pos-stn-17-2MP1L979', 'stn-17', '2MP1L979', 'MONIEPOINT', 'MONIEPOINT - 2MP1L979', true),
  ('pos-stn-17-2TPTGJFM', 'stn-17', '2TPTGJFM', 'MONIEPOINT', 'MONIEPOINT - 2TPTGJFM', true),
  ('pos-stn-17-21060574', 'stn-17', '21060574', 'SIGNATURE', 'SIGNATURE - 21060574', true),
  ('pos-stn-18-2MP1FS3O', 'stn-18', '2MP1FS3O', 'MONIEPOINT', 'MONIEPOINT - 2MP1FS3O', true),
  ('pos-stn-18-2MP1S2D7', 'stn-18', '2MP1S2D7', 'MONIEPOINT', 'MONIEPOINT - 2MP1S2D7', true),
  ('pos-stn-19-2214L1EM', 'stn-19', '2214L1EM', 'FCMB', 'FCMB - 2214L1EM', true),
  ('pos-stn-19-2214RCH1', 'stn-19', '2214RCH1', 'FCMB', 'FCMB - 2214RCH1', true),
  ('pos-stn-19-2MP1CXI3', 'stn-19', '2MP1CXI3', 'MONIEPOINT', 'MONIEPOINT - 2MP1CXI3', true),
  ('pos-stn-19-2TPT2R2F', 'stn-19', '2TPT2R2F', 'MONIEPOINT', 'MONIEPOINT - 2TPT2R2F', true),
  ('pos-stn-19-2TPTC8VI', 'stn-19', '2TPTC8VI', 'MONIEPOINT', 'MONIEPOINT - 2TPTC8VI', true),
  ('pos-stn-19-2TPTKEZS', 'stn-19', '2TPTKEZS', 'MONIEPOINT', 'MONIEPOINT - 2TPTKEZS', true),
  ('pos-stn-19-2TPTKXVF', 'stn-19', '2TPTKXVF', 'MONIEPOINT', 'MONIEPOINT - 2TPTKXVF', true),
  ('pos-stn-19-21060578', 'stn-19', '21060578', 'SIGNATURE', 'SIGNATURE - 21060578', true),
  ('pos-stn-19-2033V3KX', 'stn-19', '2033V3KX', 'UBA', 'UBA - 2033V3KX', true),
  ('pos-stn-20-20826621', 'stn-20', '20826621', 'KEYSTONE', 'KEYSTONE - 20826621', true),
  ('pos-stn-20-2MP1PXI6', 'stn-20', '2MP1PXI6', 'MONIEPOINT', 'MONIEPOINT - 2MP1PXI6', true),
  ('pos-stn-20-2TPT2NZ5', 'stn-20', '2TPT2NZ5', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NZ5', true),
  ('pos-stn-20-2TPTKG9Q', 'stn-20', '2TPTKG9Q', 'MONIEPOINT', 'MONIEPOINT - 2TPTKG9Q', true),
  ('pos-stn-20-21060565', 'stn-20', '21060565', 'SIGNATURE', 'SIGNATURE - 21060565', true),
  ('pos-stn-21-22141CXC', 'stn-21', '22141CXC', 'FCMB', 'FCMB - 22141CXC', true),
  ('pos-stn-21-22141KQR', 'stn-21', '22141KQR', 'FCMB', 'FCMB - 22141KQR', true),
  ('pos-stn-21-22142HRJ', 'stn-21', '22142HRJ', 'FCMB', 'FCMB - 22142HRJ', true),
  ('pos-stn-21-22149B4P', 'stn-21', '22149B4P', 'FCMB', 'FCMB - 22149B4P', true),
  ('pos-stn-21-2214NH3N', 'stn-21', '2214NH3N', 'FCMB', 'FCMB - 2214NH3N', true),
  ('pos-stn-21-2214XML9', 'stn-21', '2214XML9', 'FCMB', 'FCMB - 2214XML9', true),
  ('pos-stn-21-2TPTB0RD', 'stn-21', '2TPTB0RD', 'MONIEPOINT', 'MONIEPOINT - 2TPTB0RD', true),
  ('pos-stn-22-22143WE1', 'stn-22', '22143WE1', 'FCMB', 'FCMB - 22143WE1', true),
  ('pos-stn-22-2214TPRX', 'stn-22', '2214TPRX', 'FCMB', 'FCMB - 2214TPRX', true),
  ('pos-stn-22-2082ZS39', 'stn-22', '2082ZS39', 'KEYSTONE', 'KEYSTONE - 2082ZS39', true),
  ('pos-stn-22-2MP1L6WC', 'stn-22', '2MP1L6WC', 'MONIEPOINT', 'MONIEPOINT - 2MP1L6WC', true),
  ('pos-stn-22-2TPT2MKY', 'stn-22', '2TPT2MKY', 'MONIEPOINT', 'MONIEPOINT - 2TPT2MKY', true),
  ('pos-stn-22-2TPT4ACH', 'stn-22', '2TPT4ACH', 'MONIEPOINT', 'MONIEPOINT - 2TPT4ACH', true),
  ('pos-stn-22-2TPT9LH5', 'stn-22', '2TPT9LH5', 'MONIEPOINT', 'MONIEPOINT - 2TPT9LH5', true),
  ('pos-stn-22-21060587', 'stn-22', '21060587', 'SIGNATURE', 'SIGNATURE - 21060587', true),
  ('pos-stn-23-2214CRLT', 'stn-23', '2214CRLT', 'FCMB', 'FCMB - 2214CRLT', true),
  ('pos-stn-23-2LUX04U1', 'stn-23', '2LUX04U1', 'FCMB', 'FCMB - 2LUX04U1', true),
  ('pos-stn-23-2MP1Q8XW', 'stn-23', '2MP1Q8XW', 'MONIEPOINT', 'MONIEPOINT - 2MP1Q8XW', true),
  ('pos-stn-23-21060577', 'stn-23', '21060577', 'SIGNATURE', 'SIGNATURE - 21060577', true),
  ('pos-stn-23-2033S2Q2', 'stn-23', '2033S2Q2', 'UBA', 'UBA - 2033S2Q2', true),
  ('pos-stn-24-22144WT7', 'stn-24', '22144WT7', 'FCMB', 'FCMB - 22144WT7', true),
  ('pos-stn-24-2082EK87', 'stn-24', '2082EK87', 'KEYSTONE', 'KEYSTONE - 2082EK87', true),
  ('pos-stn-24-2MP1BYI7', 'stn-24', '2MP1BYI7', 'MONIEPOINT', 'MONIEPOINT - 2MP1BYI7', true),
  ('pos-stn-24-2TPTP5VT', 'stn-24', '2TPTP5VT', 'MONIEPOINT', 'MONIEPOINT - 2TPTP5VT', true),
  ('pos-stn-24-21060568', 'stn-24', '21060568', 'SIGNATURE', 'SIGNATURE - 21060568', true),
  ('pos-stn-24-2033S2Q3', 'stn-24', '2033S2Q3', 'UBA', 'UBA - 2033S2Q3', true),
  ('pos-stn-25-2082ZN25', 'stn-25', '2082ZN25', 'KEYSTONE', 'KEYSTONE - 2082ZN25', true),
  ('pos-stn-25-2MP16JJ9', 'stn-25', '2MP16JJ9', 'MONIEPOINT', 'MONIEPOINT - 2MP16JJ9', true),
  ('pos-stn-25-2TPT2MNK', 'stn-25', '2TPT2MNK', 'MONIEPOINT', 'MONIEPOINT - 2TPT2MNK', true),
  ('pos-stn-25-21060579', 'stn-25', '21060579', 'SIGNATURE', 'SIGNATURE - 21060579', true),
  ('pos-stn-26-221436MA', 'stn-26', '221436MA', 'FCMB', 'FCMB - 221436MA', true),
  ('pos-stn-26-2TPTIHKN', 'stn-26', '2TPTIHKN', 'MONIEPOINT', 'MONIEPOINT - 2TPTIHKN', true),
  ('pos-stn-26-21060580', 'stn-26', '21060580', 'SIGNATURE', 'SIGNATURE - 21060580', true),
  ('pos-stn-27-2044ZTCY', 'stn-27', '2044ZTCY', 'ACCESS', 'ACCESS - 2044ZTCY', true),
  ('pos-stn-27-2214NAXU', 'stn-27', '2214NAXU', 'FCMB', 'FCMB - 2214NAXU', true),
  ('pos-stn-27-2MP1EZFZ', 'stn-27', '2MP1EZFZ', 'MONIEPOINT', 'MONIEPOINT - 2MP1EZFZ', true),
  ('pos-stn-27-2TPT2GH8', 'stn-27', '2TPT2GH8', 'MONIEPOINT', 'MONIEPOINT - 2TPT2GH8', true),
  ('pos-stn-27-21060263', 'stn-27', '21060263', 'SIGNATURE', 'SIGNATURE - 21060263', true),
  ('pos-stn-27-21060566', 'stn-27', '21060566', 'SIGNATURE', 'SIGNATURE - 21060566', true),
  ('pos-stn-27-2PQ35156', 'stn-27', '2PQ35156', 'WEMA', 'WEMA - 2PQ35156', true),
  ('pos-stn-28-2TPTHP96', 'stn-28', '2TPTHP96', 'MONIEPOINT', 'MONIEPOINT - 2TPTHP96', true),
  ('pos-stn-28-21060584', 'stn-28', '21060584', 'SIGNATURE', 'SIGNATURE - 21060584', true),
  ('pos-stn-28-203323M8', 'stn-28', '203323M8', 'UBA', 'UBA - 203323M8', true),
  ('pos-stn-28-2033Z3M8', 'stn-28', '2033Z3M8', 'UBA', 'UBA - 2033Z3M8', true),
  ('pos-stn-29-2LUX03E9', 'stn-29', '2LUX03E9', 'FCMB', 'FCMB - 2LUX03E9', true),
  ('pos-stn-29-2082VQ40', 'stn-29', '2082VQ40', 'KEYSTONE', 'KEYSTONE - 2082VQ40', true),
  ('pos-stn-29-2MP1DJDP', 'stn-29', '2MP1DJDP', 'MONIEPOINT', 'MONIEPOINT - 2MP1DJDP', true),
  ('pos-stn-29-2TPT2N94', 'stn-29', '2TPT2N94', 'MONIEPOINT', 'MONIEPOINT - 2TPT2N94', true),
  ('pos-stn-29-21060588', 'stn-29', '21060588', 'SIGNATURE', 'SIGNATURE - 21060588', true),
  ('pos-stn-30-2TPTIAD2', 'stn-30', '2TPTIAD2', 'MONIEPOINT', 'MONIEPOINT - 2TPTIAD2', true),
  ('pos-stn-30-21060591', 'stn-30', '21060591', 'SIGNATURE', 'SIGNATURE - 21060591', true),
  ('pos-stn-30-20330P1V', 'stn-30', '20330P1V', 'UBA', 'UBA - 20330P1V', true),
  ('pos-stn-30-2033Z3M9', 'stn-30', '2033Z3M9', 'UBA', 'UBA - 2033Z3M9', true),
  ('pos-stn-31-2MP1KE4N', 'stn-31', '2MP1KE4N', 'MONIEPOINT', 'MONIEPOINT - 2MP1KE4N', true),
  ('pos-stn-31-21060592', 'stn-31', '21060592', 'SIGNATURE', 'SIGNATURE - 21060592', true),
  ('pos-stn-31-20330P1W', 'stn-31', '20330P1W', 'UBA', 'UBA - 20330P1W', true),
  ('pos-stn-31-2033Z3M7', 'stn-31', '2033Z3M7', 'UBA', 'UBA - 2033Z3M7', true),
  ('pos-stn-32-2044BXLU', 'stn-32', '2044BXLU', 'ACCESS', 'ACCESS - 2044BXLU', true),
  ('pos-stn-32-22143Q54', 'stn-32', '22143Q54', 'FCMB', 'FCMB - 22143Q54', true),
  ('pos-stn-32-2MP1JAPC', 'stn-32', '2MP1JAPC', 'MONIEPOINT', 'MONIEPOINT - 2MP1JAPC', true),
  ('pos-stn-32-2TPT2NYM', 'stn-32', '2TPT2NYM', 'MONIEPOINT', 'MONIEPOINT - 2TPT2NYM', true),
  ('pos-stn-32-2TPTADVX', 'stn-32', '2TPTADVX', 'MONIEPOINT', 'MONIEPOINT - 2TPTADVX', true),
  ('pos-stn-32-21060258', 'stn-32', '21060258', 'SIGNATURE', 'SIGNATURE - 21060258', true),
  ('pos-stn-32-21060567', 'stn-32', '21060567', 'SIGNATURE', 'SIGNATURE - 21060567', true),
  ('pos-stn-32-2PQ35179', 'stn-32', '2PQ35179', 'WEMA', 'WEMA - 2PQ35179', true),
  ('pos-stn-32-2PQ35180', 'stn-32', '2PQ35180', 'WEMA', 'WEMA - 2PQ35180', true),
  ('pos-stn-33-2LUX04TZ', 'stn-33', '2LUX04TZ', 'FCMB', 'FCMB - 2LUX04TZ', true),
  ('pos-stn-33-2TPTATYG', 'stn-33', '2TPTATYG', 'MONIEPOINT', 'MONIEPOINT - 2TPTATYG', true),
  ('pos-stn-33-2TPTF103', 'stn-33', '2TPTF103', 'MONIEPOINT', 'MONIEPOINT - 2TPTF103', true),
  ('pos-stn-33-21060583', 'stn-33', '21060583', 'SIGNATURE', 'SIGNATURE - 21060583', true),
  ('pos-stn-33-2033Z3M1', 'stn-33', '2033Z3M1', 'UBA', 'UBA - 2033Z3M1', true),
  ('pos-stn-34-22142FD1', 'stn-34', '22142FD1', 'FCMB', 'FCMB - 22142FD1', true),
  ('pos-stn-34-2214MF1U', 'stn-34', '2214MF1U', 'FCMB', 'FCMB - 2214MF1U', true),
  ('pos-stn-34-2LUX05DF', 'stn-34', '2LUX05DF', 'FCMB', 'FCMB - 2LUX05DF', true),
  ('pos-stn-34-2TPT9FE6', 'stn-34', '2TPT9FE6', 'MONIEPOINT', 'MONIEPOINT - 2TPT9FE6', true),
  ('pos-stn-34-2TPTAP9A', 'stn-34', '2TPTAP9A', 'MONIEPOINT', 'MONIEPOINT - 2TPTAP9A', true),
  ('pos-stn-34-2TPTCW14', 'stn-34', '2TPTCW14', 'MONIEPOINT', 'MONIEPOINT - 2TPTCW14', true),
  ('pos-stn-34-2TPTDEIB', 'stn-34', '2TPTDEIB', 'MONIEPOINT', 'MONIEPOINT - 2TPTDEIB', true),
  ('pos-stn-34-2TPTF635', 'stn-34', '2TPTF635', 'MONIEPOINT', 'MONIEPOINT - 2TPTF635', true),
  ('pos-stn-34-2TPTFKAJ', 'stn-34', '2TPTFKAJ', 'MONIEPOINT', 'MONIEPOINT - 2TPTFKAJ', true),
  ('pos-stn-34-2TPTHCQM', 'stn-34', '2TPTHCQM', 'MONIEPOINT', 'MONIEPOINT - 2TPTHCQM', true),
  ('pos-stn-34-2TPTKVHA', 'stn-34', '2TPTKVHA', 'MONIEPOINT', 'MONIEPOINT - 2TPTKVHA', true),
  ('pos-stn-34-21060586', 'stn-34', '21060586', 'SIGNATURE', 'SIGNATURE - 21060586', true),
  ('pos-stn-34-2033Z3M2', 'stn-34', '2033Z3M2', 'UBA', 'UBA - 2033Z3M2', true),
  ('pos-stn-34-2033Z3M5', 'stn-34', '2033Z3M5', 'UBA', 'UBA - 2033Z3M5', true),
  ('pos-stn-35-2LUX048E', 'stn-35', '2LUX048E', 'FCMB', 'FCMB - 2LUX048E', true),
  ('pos-stn-35-20826950', 'stn-35', '20826950', 'KEYSTONE', 'KEYSTONE - 20826950', true),
  ('pos-stn-35-2MP1OOQF', 'stn-35', '2MP1OOQF', 'MONIEPOINT', 'MONIEPOINT - 2MP1OOQF', true),
  ('pos-stn-36-2LUX05G7', 'stn-36', '2LUX05G7', 'FCMB', 'FCMB - 2LUX05G7', true),
  ('pos-stn-36-2MP1L6GM', 'stn-36', '2MP1L6GM', 'MONIEPOINT', 'MONIEPOINT - 2MP1L6GM', true),
  ('pos-stn-36-21060564', 'stn-36', '21060564', 'SIGNATURE', 'SIGNATURE - 21060564', true),
  ('pos-stn-37-2044BXLQ', 'stn-37', '2044BXLQ', 'ACCESS', 'ACCESS - 2044BXLQ', true),
  ('pos-stn-37-2044BXLS', 'stn-37', '2044BXLS', 'ACCESS', 'ACCESS - 2044BXLS', true),
  ('pos-stn-37-2LUXZZ06', 'stn-37', '2LUXZZ06', 'FCMB', 'FCMB - 2LUXZZ06', true),
  ('pos-stn-37-2082ZI86', 'stn-37', '2082ZI86', 'KEYSTONE', 'KEYSTONE - 2082ZI86', true),
  ('pos-stn-37-2MP1MPZM', 'stn-37', '2MP1MPZM', 'MONIEPOINT', 'MONIEPOINT - 2MP1MPZM', true),
  ('pos-stn-37-2TPT1BO8', 'stn-37', '2TPT1BO8', 'MONIEPOINT', 'MONIEPOINT - 2TPT1BO8', true),
  ('pos-stn-37-2TPT1KCF', 'stn-37', '2TPT1KCF', 'MONIEPOINT', 'MONIEPOINT - 2TPT1KCF', true),
  ('pos-stn-37-2TPTBJFU', 'stn-37', '2TPTBJFU', 'MONIEPOINT', 'MONIEPOINT - 2TPTBJFU', true),
  ('pos-stn-37-21060571', 'stn-37', '21060571', 'SIGNATURE', 'SIGNATURE - 21060571', true),
  ('pos-stn-37-2033Z3M6', 'stn-37', '2033Z3M6', 'UBA', 'UBA - 2033Z3M6', true),
  ('pos-stn-37-2PQ35166', 'stn-37', '2PQ35166', 'WEMA', 'WEMA - 2PQ35166', true),
  ('pos-stn-38-22144QWG', 'stn-38', '22144QWG', 'FCMB', 'FCMB - 22144QWG', true),
  ('pos-stn-38-2082EK88', 'stn-38', '2082EK88', 'KEYSTONE', 'KEYSTONE - 2082EK88', true),
  ('pos-stn-38-2MP1DNG7', 'stn-38', '2MP1DNG7', 'MONIEPOINT', 'MONIEPOINT - 2MP1DNG7', true),
  ('pos-stn-38-2TPT2GOR', 'stn-38', '2TPT2GOR', 'MONIEPOINT', 'MONIEPOINT - 2TPT2GOR', true),
  ('pos-stn-38-21060581', 'stn-38', '21060581', 'SIGNATURE', 'SIGNATURE - 21060581', true),
  ('pos-stn-38-2033S2Q4', 'stn-38', '2033S2Q4', 'UBA', 'UBA - 2033S2Q4', true),
  ('pos-stn-39-2TMP3MSL', 'stn-39', '2TMP3MSL', 'MONIEPOINT', 'MONIEPOINT - 2TMP3MSL', true),
  ('pos-stn-39-2TMP2W5F', 'stn-39', '2TMP2W5F', 'MONIEPOINT', 'MONIEPOINT - 2TMP2W5F', true),
  ('pos-stn-40-2MP1J450', 'stn-40', '2MP1J450', 'MONIEPOINT', 'MONIEPOINT - 2MP1J450', true),
  ('pos-stn-40-2MP1KR19', 'stn-40', '2MP1KR19', 'MONIEPOINT', 'MONIEPOINT - 2MP1KR19', true),
  ('pos-stn-40-2MP1KGZ3', 'stn-40', '2MP1KGZ3', 'MONIEPOINT', 'MONIEPOINT - 2MP1KGZ3', true)
on conflict (id) do nothing;
