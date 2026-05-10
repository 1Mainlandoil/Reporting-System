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
  role text not null check (role in ('staff', 'supervisor', 'admin')),
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
  dispatch_note text not null default '',
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
  created_at timestamptz not null default now()
);

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
  add column if not exists no_sales_day boolean not null default false,
  add column if not exists no_sales_reason text not null default '',
  add column if not exists no_sales_note text not null default '',
  add column if not exists cash_bf numeric not null default 0,
  add column if not exists cash_sales numeric not null default 0,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists closing_balance numeric not null default 0;

alter table public.users
  add column if not exists manager_username text,
  add column if not exists manager_password_hash text;

create index if not exists idx_daily_reports_station_date on public.daily_reports(station_id, date desc);
create unique index if not exists ux_daily_reports_station_date on public.daily_reports(station_id, date);
create index if not exists idx_chat_messages_pair on public.chat_messages(from_user_id, to_user_id, created_at desc);
create index if not exists idx_admin_daily_reviews_date on public.admin_daily_reviews(date desc);
create index if not exists idx_product_requests_station_created on public.product_requests(station_id, created_at desc);
create index if not exists idx_daily_finalizations_date on public.daily_finalizations(date desc);
create index if not exists idx_interventions_station_updated on public.interventions(station_id, updated_at desc);
create index if not exists idx_admin_replenishment_status on public.admin_replenishment_workflows(status, updated_at desc);
create index if not exists idx_admin_report_resolutions_updated on public.admin_report_resolutions(updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_non_negative'
  ) then
    alter table public.daily_reports
      add constraint chk_daily_reports_non_negative
      check (
        opening_stock_pms >= 0 and
        opening_stock_ago >= 0 and
        pms_price >= 0 and
        ago_price >= 0 and
        sales_amount_pms >= 0 and
        sales_amount_ago >= 0 and
        total_sales_amount >= 0 and
        quantity_received >= 0 and
        received_pms >= 0 and
        received_ago >= 0 and
        total_sales_liters_pms >= 0 and
        total_sales_liters_ago >= 0 and
        rtt_pms >= 0 and
        rtt_ago >= 0 and
        expense_amount >= 0 and
        cash_bf >= 0 and
        cash_sales >= 0 and
        total_amount >= 0 and
        total_payment_deposits >= 0 and
        pos_value >= 0 and
        closing_balance >= 0 and
        coalesce(closing_stock_pms, 0) >= 0 and
        coalesce(closing_stock_ago, 0) >= 0
      ) not valid;
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
  if not exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_received_consistency'
  ) then
    alter table public.daily_reports
      add constraint chk_daily_reports_received_consistency
      check (
        quantity_received = (received_pms + received_ago)
      ) not valid;
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
