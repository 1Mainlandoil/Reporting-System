# Backup and Recovery Runbook

## Purpose

This runbook defines how Mainland Reporting System data is protected, restored, and verified.

## Scope

- Supabase Postgres data
- Core operational tables:
  - `users`
  - `stations`
  - `daily_reports`
  - `product_requests`
  - `daily_finalizations`
  - `month_end_finalizations`
  - `admin_daily_reviews`
  - `admin_replenishment_workflows`
  - `admin_report_resolutions`
  - `interventions`
  - `chat_messages`

## Targets

- **RPO (Recovery Point Objective):** <= 24 hours
- **RTO (Recovery Time Objective):** <= 4 hours

## Ownership

- **Primary owner:** DB duty officer (IT/Admin lead)
- **Backup owner:** Secondary IT lead
- **Approval for recovery:** Product owner + IT lead

## Backup Policy

1. Use Supabase automated backups (daily minimum).
2. Keep retention to at least 7 days (14+ preferred for production).
3. Before every production release:
   - Create a manual backup/snapshot.
   - Export critical tables (optional safety layer).
4. Store release notes with backup timestamp and release tag.

## Pre-Release Backup Checklist

1. Confirm no long-running migration is active.
2. Trigger/manual-check backup status in Supabase dashboard.
3. Record:
   - Backup timestamp
   - Environment (`prod`/`staging`)
   - Operator name
4. Proceed with release only after backup confirmation.

## Recovery Decision Tree

Recover if any of the following occurs:

- Accidental data deletion/update in production
- Corrupted migration or invalid bulk operation
- Security incident requiring rollback
- Severe app malfunction caused by bad data writes

## Recovery Procedure (High Level)

1. **Stabilize**
   - Pause risky write operations (temporarily disable write paths if needed).
   - Announce incident internally.
2. **Identify restore point**
   - Choose timestamp just before bad change.
3. **Restore in Supabase**
   - Use backup/PITR controls to restore to selected point.
4. **Validate data**
   - Run verification queries (section below).
5. **Smoke test app**
   - Manager login + report submit
   - Supervisor review/finalize
   - Admin save/report/history
   - IT user update
6. **Resume traffic**
   - Re-enable writes after sign-off.
7. **Post-incident report**
   - Root cause, impact, corrective actions.

## Verification Queries (Post-Restore)

Run these in Supabase SQL editor:

```sql
select count(*) as users_count from public.users;
select count(*) as stations_count from public.stations;
select count(*) as reports_count from public.daily_reports;
select max(created_at) as latest_report_created_at from public.daily_reports;
```

```sql
-- Duplicate daily report check (should return zero rows)
select station_id, date, count(*) as dup_count
from public.daily_reports
group by station_id, date
having count(*) > 1;
```

```sql
-- Sanity check for negative values (should return zero rows)
select id, station_id, date
from public.daily_reports
where opening_stock_pms < 0
   or opening_stock_ago < 0
   or total_sales_liters_pms < 0
   or total_sales_liters_ago < 0
   or cash_sales < 0;
```

## Monthly Recovery Drill

Perform once per month in staging:

1. Seed realistic data snapshot.
2. Simulate a bad write/delete event.
3. Restore to known point.
4. Execute verification queries.
5. Run role-based smoke tests.
6. Document drill duration and issues found.

Track:
- Drill date
- Duration to restore
- Failures observed
- Improvements added

## Emergency Contacts

Define and keep current:

- Product owner
- IT lead
- Backup operator
- Engineering support

Store contact list in your internal operations channel/document.

## Notes

- After testing phase, when legacy/test rows are cleaned, validate all DB constraints in production.
- Keep this runbook updated whenever schema or critical workflows change.
