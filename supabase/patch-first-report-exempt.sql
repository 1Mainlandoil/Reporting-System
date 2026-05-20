-- Run once in Supabase SQL Editor: allow each station's first report without non-negative checks.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'chk_daily_reports_non_negative'
  ) then
    alter table public.daily_reports drop constraint chk_daily_reports_non_negative;
  end if;
end $$;

create or replace function public.enforce_daily_reports_non_negative()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.daily_reports dr
    where dr.station_id = new.station_id
      and dr.id is distinct from new.id
  ) then
    if new.opening_stock_pms < 0 or new.opening_stock_ago < 0 or
       new.pms_price < 0 or new.ago_price < 0 or
       new.sales_amount_pms < 0 or new.sales_amount_ago < 0 or
       new.total_sales_amount < 0 or
       new.quantity_received < 0 or new.received_pms < 0 or new.received_ago < 0 or
       new.total_sales_liters_pms < 0 or new.total_sales_liters_ago < 0 or
       new.rtt_pms < 0 or new.rtt_ago < 0 or
       new.expense_amount < 0 or
       new.cash_bf < 0 or new.cash_sales < 0 or
       new.total_amount < 0 or new.total_payment_deposits < 0 or
       new.closing_balance < 0 or
       coalesce(new.closing_stock_pms, 0) < 0 or coalesce(new.closing_stock_ago, 0) < 0 then
      raise exception 'daily report values must be non-negative after the first submission for this station';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_daily_reports_non_negative on public.daily_reports;

create trigger trg_daily_reports_non_negative
  before insert or update on public.daily_reports
  for each row
  execute function public.enforce_daily_reports_non_negative();
