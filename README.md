# Mainland Reporting System

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env` and fill:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Start the app with `npm run dev`.

If Supabase env vars are missing, the app automatically falls back to local mock/persisted data.

## Operations

- Backup and recovery runbook: `BACKUP_RECOVERY.md`
